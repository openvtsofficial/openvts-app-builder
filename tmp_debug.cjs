const fs = require('fs');

// Debug _VehicleInfoRowData
const content = fs.readFileSync('e:/Development/OpenVTS/OpenVTS-Appbuilder/templates/flutter_base/lib/features/live_map/screens/live_map_screen.dart', 'utf8');
const lines = content.split('\n');

// Constructor starts at line 6923 (0-indexed: 6922)
let constructorText = '';
let parenCount = 0;
for (let k = 6922; k < 6930; k++) {
    constructorText += lines[k] + '\n';
    for (const ch of lines[k]) {
        if (ch === '(') parenCount++;
        if (ch === ')') parenCount--;
    }
    console.log(`Line ${k+1}: parenCount=${parenCount} | ${lines[k]}`);
    if (parenCount <= 0 && k > 6922) break;
}

console.log('\n=== CONSTRUCTOR TEXT ===');
console.log(constructorText);

const afterCloseParen = constructorText.indexOf(')');
console.log('\nafterCloseParen index:', afterCloseParen);
const initPart = constructorText.substring(afterCloseParen);
console.log('\n=== INIT PART ===');
console.log(initPart);

const thisFields = new Set();
const thisRegex = /this\.(\w+)/g;
let m;
while ((m = thisRegex.exec(constructorText)) !== null) {
    thisFields.add(m[1]);
}
const initListRegex = /(\w+)\s*=/g;
while ((m = initListRegex.exec(initPart)) !== null) {
    thisFields.add(m[1]);
}
console.log('\n=== ALL FIELDS FOUND ===');
console.log([...thisFields]);

// Debug UserReportController
console.log('\n\n=== UserReportController ===');
const content2 = fs.readFileSync('e:/Development/OpenVTS/OpenVTS-Appbuilder/templates/flutter_base/lib/features/user/controllers/user_report_controller.dart', 'utf8');
const lines2 = content2.split('\n');

let constructorText2 = '';
let parenCount2 = 0;
for (let k = 9; k < 20; k++) {
    constructorText2 += lines2[k] + '\n';
    for (const ch of lines2[k]) {
        if (ch === '(') parenCount2++;
        if (ch === ')') parenCount2--;
    }
    console.log(`Line ${k+1}: parenCount=${parenCount2} | ${lines2[k]}`);
    if (parenCount2 <= 0 && k > 9) break;
}

console.log('\n=== CONSTRUCTOR TEXT ===');
console.log(constructorText2);

const afterCloseParen2 = constructorText2.indexOf(')');
console.log('\nafterCloseParen index:', afterCloseParen2);
const initPart2 = constructorText2.substring(afterCloseParen2);
console.log('\n=== INIT PART ===');
console.log(initPart2);

const thisFields2 = new Set();
const thisRegex2 = /this\.(\w+)/g;
while ((m = thisRegex2.exec(constructorText2)) !== null) {
    thisFields2.add(m[1]);
}
const initListRegex2 = /(\w+)\s*=/g;
while ((m = initListRegex2.exec(initPart2)) !== null) {
    thisFields2.add(m[1]);
}
console.log('\n=== ALL FIELDS FOUND ===');
console.log([...thisFields2]);
