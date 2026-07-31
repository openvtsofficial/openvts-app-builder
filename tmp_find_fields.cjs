const fs = require('fs');
const path = require('path');

const baseDir = 'e:/Development/OpenVTS/OpenVTS-Appbuilder/templates/flutter_base';
const results = [];

function walkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDir(fullPath);
        } else if (entry.name.endsWith('.dart')) {
            analyzeDartFile(fullPath);
        }
    }
}

function escapeRegex(str) {
    return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function analyzeDartFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    let i = 0;
    while (i < lines.length) {
        const classMatch = lines[i].match(/^\s*class\s+(\w+)/);
        if (classMatch) {
            const className = classMatch[1];
            const classStart = i;

            // Find end of class (look for next top-level class)
            let classEnd = lines.length;
            for (let j = classStart + 1; j < lines.length; j++) {
                if (/^\s*class\s+\w+/.test(lines[j]) && (lines[j].match(/^\s*/)[0].length <= 0)) {
                    classEnd = j;
                    break;
                }
            }

            // Find constructor with named parameters within class
            let constructorText = '';
            let constructorStart = -1;

            for (let j = classStart; j < Math.min(classStart + 100, classEnd); j++) {
                const escapedName = escapeRegex(className);
                const consRegex = new RegExp('\\b' + escapedName + '\\s*\\(');
                if (consRegex.test(lines[j])) {
                    constructorStart = j;
                    let parenCount = 0;
                    for (let k = j; k < Math.min(j + 60, classEnd); k++) {
                        constructorText += lines[k] + '\n';
                        for (const ch of lines[k]) {
                            if (ch === '(') parenCount++;
                            if (ch === ')') parenCount--;
                        }
                        if (parenCount <= 0 && k > j) break;
                        if (parenCount <= 0 && k === j && lines[j].indexOf(')') > lines[j].indexOf('(')) break;
                    }
                    break;
                }
            }

            if (constructorStart === -1 || !constructorText.includes('{')) {
                i++;
                continue;
            }

            // Extract this.fieldName from constructor
            const thisFields = new Set();
            const thisRegex = /this\.(\w+)/g;
            let m;
            while ((m = thisRegex.exec(constructorText)) !== null) {
                thisFields.add(m[1]);
            }

            // Find final fields in class body (between constructor end and class end)
            for (let j = classStart + 1; j < classEnd; j++) {
                const fieldMatch = lines[j].match(/^\s{2,4}final\s+([\w<>?,.\s]+?)\s+(\w+)\s*;/);
                if (fieldMatch) {
                    const fieldType = fieldMatch[1].trim();
                    const fieldName = fieldMatch[2];

                    // Skip if field is in constructor
                    if (thisFields.has(fieldName)) continue;

                    // Skip if field has initialization (= sign before ;)
                    const beforeSemicolon = lines[j].split(';')[0];
                    if (beforeSemicolon.includes('=')) continue;

                    // Skip common false positives
                    if (fieldName === 'key') continue;

                    // Check indentation - should be class-level (2-4 spaces typically)
                    const indent = lines[j].length - lines[j].trimStart().length;
                    if (indent > 6) continue;

                    results.push({
                        file: filePath.replace(/\\/g, '/'),
                        line: j + 1,
                        field: lines[j].trim(),
                        fieldType: fieldType,
                        fieldName: fieldName,
                        className: className,
                        constructorLine: constructorStart + 1,
                        constructor: constructorText.trim().substring(0, 500)
                    });
                }
            }
        }
        i++;
    }
}

walkDir(baseDir);

for (const r of results) {
    const relPath = r.file.replace(baseDir.replace(/\\/g, '/') + '/', '');
    console.log('=== FILE: ' + relPath);
    console.log('  Line ' + r.line + ': ' + r.field);
    console.log('  Class: ' + r.className);
    console.log('  Missing field: ' + r.fieldName + ' (type: ' + r.fieldType + ')');
    console.log('  Constructor at line ' + r.constructorLine + ':');
    const consLines = r.constructor.split('\n').slice(0, 12);
    for (const cl of consLines) {
        console.log('    ' + cl);
    }
    console.log('');
}

console.log('Total findings: ' + results.length);
