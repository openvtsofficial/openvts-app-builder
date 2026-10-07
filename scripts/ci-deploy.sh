#!/usr/bin/env bash
# Remote command arguments intentionally expand locally after validation below.
# shellcheck disable=SC2029
set -Eeuo pipefail
umask 077
[[ $EC2_HOST =~ ^[a-zA-Z0-9.-]+$ && $EC2_USER =~ ^[a-zA-Z0-9_-]+$ ]]
[[ $GITHUB_SHA =~ ^[a-f0-9]{40}$ ]]
[[ $DEPLOY_IMAGE =~ ^ghcr\.io/openvtsofficial/openvts-app-builder@sha256:[a-f0-9]{64}$ ]]
[[ $GHCR_USER =~ ^[a-zA-Z0-9_-]+(\[bot\])?$ ]]
key_file="$RUNNER_TEMP/studio-deploy-key"
hosts_file="$RUNNER_TEMP/studio-known-hosts"
printf '%s\n' "$EC2_SSH_KEY" > "$key_file"
printf '%s\n' "$EC2_KNOWN_HOSTS" > "$hosts_file"
chmod 600 "$key_file" "$hosts_file"
options=(-i "$key_file" -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$hosts_file" -o ConnectTimeout=15 -o ConnectionAttempts=2 -o ServerAliveInterval=30 -o ServerAliveCountMax=6)
target="$EC2_USER@$EC2_HOST"
release_dir="/opt/studio/app/.deploy-state/releases/$GITHUB_SHA"
registry_dir="$release_dir/registry"
cleanup() {
  ssh "${options[@]}" "$target" "rm -f '$registry_dir/config.json'; rmdir '$registry_dir' 2>/dev/null || true" >/dev/null 2>&1 || true
  rm -f "$key_file"
}
trap cleanup EXIT
ssh "${options[@]}" "$target" "umask 077; mkdir -p '$release_dir/scripts' '$registry_dir'; chmod 700 '$release_dir' '$registry_dir'"
scp "${options[@]}" docker-compose.prod.yml "$target:$release_dir/docker-compose.prod.yml"
scp "${options[@]}" scripts/deploy-studio.sh "$target:$release_dir/scripts/deploy-studio.sh"
printf '%s' "$GHCR_TOKEN" | ssh "${options[@]}" "$target" "docker --config '$registry_dir' login ghcr.io -u '$GHCR_USER' --password-stdin"
ssh "${options[@]}" "$target" "DOCKER_CONFIG='$registry_dir' bash '$release_dir/scripts/deploy-studio.sh' '$DEPLOY_IMAGE' '$GITHUB_SHA'"
