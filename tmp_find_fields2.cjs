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
    return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function analyzeDartFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    let i = 0;
    while (i < lines.length) {
        // Look for class declarations that extend Widget types
        const classMatch = lines[i].match(/^\s*class\s+(\w+)\s+extends\s+(StatelessWidget|StatefulWidget|State<\w+>)/);
        if (!classMatch) {
            i++;
            continue;
        }

        const className = classMatch[1];
        const classStart = i;
        const classIndent = lines[i].length - lines[i].trimStart().length;

        // Find end of class by tracking braces
        let braceCount = 0;
        let classEnd = lines.length;
        let foundOpenBrace = false;
        for (let j = classStart; j < lines.length; j++) {
            for (const ch of lines[j]) {
                if (ch === '{') { braceCount++; foundOpenBrace = true; }
                if (ch === '}') braceCount--;
            }
            if (foundOpenBrace && braceCount <= 0) {
                classEnd = j + 1;
                break;
            }
        }

        // Find constructor with named parameters within class
        let constructorText = '';
        let constructorStart = -1;
        let constructorEnd = -1;

        for (let j = classStart; j < Math.min(classStart + 80, classEnd); j++) {
            const escapedName = escapeRegex(className);
            const consRegex = new RegExp('\\b(?:const\\s+)?' + escapedName + '\\s*\\(');
            if (consRegex.test(lines[j])) {
                constructorStart = j;
                let parenCount = 0;
                for (let k = j; k < Math.min(j + 60, classEnd); k++) {
                    constructorText += lines[k] + '\n';
                    for (const ch of lines[k]) {
                        if (ch === '(') parenCount++;
                        if (ch === ')') parenCount--;
                    }
                    if (parenCount <= 0 && k > j) {
                        constructorEnd = k;
                        break;
                    }
                    if (parenCount <= 0 && k === j) {
                        constructorEnd = k;
                        break;
                    }
                }
                break;
            }
        }

        if (constructorStart === -1 || !constructorText.includes('{')) {
            i++;
            continue;
        }

        // Extract this.fieldName from constructor (including super.key)
        const thisFields = new Set();
        let m;
        const thisRegex = /this\.(\w+)/g;
        while ((m = thisRegex.exec(constructorText)) !== null) {
            thisFields.add(m[1]);
        }

        // Also extract fields from initializer list (: _field = param)
        // Look for the initializer list part after ) :
        const initListRegex = /(\w+)\s*=/g;
        const afterCloseParen = constructorText.indexOf(')');
        if (afterCloseParen >= 0) {
            const initPart = constructorText.substring(afterCloseParen);
            while ((m = initListRegex.exec(initPart)) !== null) {
                thisFields.add(m[1]);
            }
        }

        // Find final fields that are class-level (right after constructor, before methods)
        // Class fields in Dart widgets are typically at 2 spaces indent (class body level)
        const expectedFieldIndent = classIndent + 2;

        for (let j = classStart + 1; j < classEnd; j++) {
            const line = lines[j];
            const trimmed = line.trimStart();
            const indent = line.length - trimmed.length;

            // Only look at class-body level fields
            if (indent !== expectedFieldIndent) continue;

            // Must start with 'final'
            if (!trimmed.startsWith('final ')) continue;

            // Match field declaration: final Type fieldName;
            const fieldMatch = trimmed.match(/^final\s+([\w<>?,.\s]+?)\s+(\w+)\s*;$/);
            if (!fieldMatch) continue;

            const fieldType = fieldMatch[1].trim();
            const fieldName = fieldMatch[2];

            // Skip if field is in constructor or initializer list
            if (thisFields.has(fieldName)) continue;

            // Skip 'key' (handled by super.key)
            if (fieldName === 'key') continue;

            // This is a field declared but not in constructor and not initialized
            results.push({
                file: filePath.replace(/\\/g, '/'),
                line: j + 1,
                field: trimmed,
                fieldType: fieldType,
                fieldName: fieldName,
                className: className,
                constructorLine: constructorStart + 1,
                constructor: constructorText.trim().substring(0, 400)
            });
        }

        i++;
    }
}

walkDir(baseDir);

console.log('');
console.log('=== WIDGET CLASSES: final fields NOT in constructor and NOT initialized ===');
console.log('');

for (const r of results) {
    const relPath = r.file.replace(baseDir.replace(/\\/g, '/') + '/', '');
    console.log('FILE: ' + relPath);
    console.log('  Line ' + r.line + ': ' + r.field);
    console.log('  Class: ' + r.className);
    console.log('  Missing field: ' + r.fieldName + ' (type: ' + r.fieldType + ')');
    console.log('  Constructor at line ' + r.constructorLine + ':');
    const consLines = r.constructor.split('\n').slice(0, 8);
    for (const cl of consLines) {
        console.log('    ' + cl);
    }
    console.log('');
}

console.log('Total findings: ' + results.length);
