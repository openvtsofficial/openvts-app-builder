#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# This script operates only on the two Studio services in the existing app project.
image=${1:?Pass the verified image digest}
release=${2:?Pass the Git commit SHA}
mode=${3:-deploy}
app_root=${STUDIO_APP_ROOT:-/opt/studio/app}
script_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
candidate_compose="$script_root/docker-compose.prod.yml"
if [[ ! $image =~ ^ghcr\.io/openvtsofficial/openvts-app-builder@sha256:[a-f0-9]{64}$ ]]; then
  echo "Expected the immutable GHCR digest produced by this workflow" >&2
  exit 1
fi
[[ $release =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid commit SHA" >&2; exit 1; }
[[ $mode == deploy || $mode == --check ]] || { echo "Unknown deployment mode" >&2; exit 1; }
app_root=$(realpath -e -- "$app_root")
env_file="$app_root/.env.production"
state="$app_root/.deploy-state"
mkdir -p "$state"
chmod 700 "$state"
exec 9>"$state/deploy.lock"
flock -n 9 || { echo "Another Studio deployment is running" >&2; exit 1; }

[[ -f $env_file && -f $app_root/signing/application-key.jks && -f $candidate_compose ]] || {
  echo "Missing production environment, existing signing key or deployment configuration" >&2
  exit 1
}
export DOCKER_IMAGE="$image"
compose=(docker compose --project-name app --project-directory "$app_root" --env-file "$env_file" -f "$candidate_compose")
snapshot=$(mktemp -d "$state/$release.XXXXXX")
"${compose[@]}" config --format json > "$snapshot/config.json"
python3 - "$snapshot/config.json" "$app_root" <<'PY'
import json, pathlib, sys
config = json.load(open(sys.argv[1]))
root = pathlib.Path(sys.argv[2])
assert set(config['services']) == {'app', 'worker'}, 'Deployment must contain only Studio services'
assert config['name'] == 'app', 'Existing Compose project must be preserved'
assert config['volumes']['studio-data']['name'] == 'app_studio-data'
assert config['volumes']['studio-data']['external'] is True
for name, memory, cpus in [('app', 536870912, '1.0'), ('worker', 3670016000, '2.0')]:
    service = config['services'][name]
    limits = service['deploy']['resources']['limits']
    assert int(limits['memory']) == memory and float(limits['cpus']) == float(cpus), 'Resource limits changed'
    assert service['networks'] == {'compose_openvts': None} or set(service['networks']) == {'compose_openvts'}
    mounts = {volume['target']: volume for volume in service['volumes']}
    assert mounts['/app/data']['source'] == 'studio-data'
    assert pathlib.Path(mounts['/app/signing']['source']) == root / 'signing'
    assert mounts['/app/signing']['read_only'] is True
    assert service['environment']['FLUTTER_TEMPLATE_REPOSITORY'] == 'https://github.com/openvtsofficial/openvts-application.git'
    assert service['environment']['FLUTTER_TEMPLATE_BRANCH'] == 'main'
    assert service['environment']['BUILD_TIMEOUT_MS'] == '3600000'
assert config['services']['app']['ports'][0]['host_ip'] == '127.0.0.1'
assert str(config['services']['app']['ports'][0]['published']) == '8082'
assert config['services']['worker']['environment']['BUILD_MIN_HOST_AVAILABLE_MB'] == '3200'
assert config['services']['worker']['environment']['BUILD_CRITICAL_HOST_AVAILABLE_MB'] == '512'
assert '-Xmx768m' in config['services']['worker']['environment']['GRADLE_JVM_ARGS']
print('Existing storage, signing mounts, network and resource limits verified')
PY
docker volume inspect app_studio-data >/dev/null
docker network inspect compose_openvts >/dev/null
for container in studio-openvts studio-worker; do
  [[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container") == app ]] || {
    echo "Unexpected Compose ownership for $container" >&2; exit 1;
  }
  [[ $(docker inspect --format '{{.State.Running}}' "$container") == true ]] || {
    echo "$container must be running before deployment" >&2; exit 1;
  }
done
# The key is readable only by the container user; retain its restrictive permissions.
# The deployment user owns the private snapshot directory used by this redirect.
# shellcheck disable=SC2024
sudo -n sha256sum "$app_root/signing/application-key.jks" > "$snapshot/key.sha256"
[[ $mode != --check ]] || { echo "Studio deployment preflight passed; no services changed"; exit 0; }

cp "$env_file" "$snapshot/env.production"
if [[ -f $app_root/.env ]]; then cp "$app_root/.env" "$snapshot/legacy.env"; fi
cp "$app_root/docker-compose.prod.yml" "$snapshot/compose.yml"
old_app=$(docker inspect --format '{{.Image}}' studio-openvts)
old_worker=$(docker inspect --format '{{.Image}}' studio-worker)
python3 - "$snapshot/images.json" "$old_app" "$old_worker" <<'PY'
import json, sys
json.dump({'services': {'app': {'image': sys.argv[2]}, 'worker': {'image': sys.argv[3]}}}, open(sys.argv[1], 'w'))
PY
docker ps --format '{{.Names}} {{.ID}}' | awk '$1 != "studio-openvts" && $1 != "studio-worker"' | sort > "$snapshot/other-containers.txt"
rollback_needed=true
web_attempted=false
rollback() {
  local status=${1:-$?}
  trap - ERR INT TERM HUP
  if [[ $rollback_needed == true ]]; then
    echo "Deployment failed; restoring the previous Studio images and configuration" >&2
    cp "$snapshot/env.production" "$env_file"
    if [[ -f $snapshot/legacy.env ]]; then cp "$snapshot/legacy.env" "$app_root/.env"; fi
    cp "$snapshot/compose.yml" "$app_root/docker-compose.prod.yml"
    if [[ $web_attempted == true ]]; then
      docker compose --project-name app --project-directory "$app_root" --env-file "$env_file" \
        -f "$snapshot/compose.yml" -f "$snapshot/images.json" up -d --no-deps --no-build --pull never app worker || {
        echo "Automatic container rollback failed; inspect Studio before retrying" >&2
      }
    else
      docker start studio-worker >/dev/null || echo "Could not resume the previous worker" >&2
    fi
  fi
  exit "${status:-1}"
}
trap rollback ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM HUP

echo "Waiting for the current Studio build to finish; new jobs remain queued"
# The worker handles SIGTERM by finishing its current job before exiting.
docker stop --time 4200 studio-worker >/dev/null
available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
[[ $available -ge 2097152 ]] || { echo "Insufficient host memory for deployment; retry later" >&2; false; }
free_bytes=$(df -PB1 "$app_root" | awk 'NR==2 {print $4}')
[[ $free_bytes -ge 21474836480 ]] || { echo "Keep at least 20 GB free before pulling the toolchain image" >&2; false; }
docker pull "$image"
"${compose[@]}" run --rm --no-deps -T --entrypoint node app node_modules/prisma/build/index.js migrate deploy
# Use the worker environment so the same signing configuration is verified.
"${compose[@]}" run --rm --no-deps -T --entrypoint node worker --import=tsx scripts/deployment-probe.mjs --check-key
web_attempted=true
"${compose[@]}" up -d --no-deps --no-build --pull never --wait --wait-timeout 120 app
curl --fail --silent --show-error --retry 5 --retry-delay 2 --max-time 10 \
  https://studio.openvts.io/api/health > "$snapshot/health.json"
python3 - "$snapshot/health.json" <<'PY'
import json, sys
health = json.load(open(sys.argv[1]))
assert health['status'] == 'ok' and health['mode'] == 'production', 'Unexpected production response'
PY
"${compose[@]}" up -d --no-deps --no-build --pull never worker
sleep 10
[[ $(docker inspect --format '{{.State.Running}}' studio-worker) == true ]]
[[ $(docker inspect --format '{{.State.OOMKilled}}' studio-worker) == false ]]
[[ $(docker inspect --format '{{.RestartCount}}' studio-worker) == 0 ]]
expected=$(docker image inspect --format '{{.Id}}' "$image")
[[ $(docker inspect --format '{{.Image}}' studio-openvts) == "$expected" ]]
[[ $(docker inspect --format '{{.Image}}' studio-worker) == "$expected" ]]
sudo -n sha256sum --check "$snapshot/key.sha256" >/dev/null
docker ps --format '{{.Names}} {{.ID}}' | awk '$1 != "studio-openvts" && $1 != "studio-worker"' | sort > "$snapshot/other-containers-after.txt"
if ! diff "$snapshot/other-containers.txt" "$snapshot/other-containers-after.txt" > "$snapshot/other-containers-diff.txt"; then
  echo "Another application's containers changed independently during deployment; see the private deployment record" >&2
fi

# Promote configuration only after every check; secrets stay in the existing file.
python3 - "$image" "$env_file" "$app_root/.env" <<'PY'
import pathlib, re, sys
for filename in sys.argv[2:]:
    path = pathlib.Path(filename)
    if not path.exists():
        continue
    content = path.read_text()
    line = 'DOCKER_IMAGE=' + sys.argv[1]
    content = re.sub(r'^DOCKER_IMAGE=.*$', line, content, flags=re.M) if re.search(r'^DOCKER_IMAGE=', content, re.M) else content.rstrip() + '\n' + line + '\n'
    temporary = path.with_name(path.name + '.deploy-tmp')
    temporary.write_text(content)
    temporary.chmod(0o600)
    temporary.replace(path)
PY
if ! cmp -s "$candidate_compose" "$app_root/docker-compose.prod.yml"; then
  cp "$candidate_compose" "$app_root/docker-compose.prod.yml"
fi
printf '%s\n' "$release $image" > "$state/current-release"
rollback_needed=false
trap - ERR INT TERM HUP
echo "Studio deployment verified and recorded: $release"
