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
        // Look for any class declaration
        const classMatch = lines[i].match(/^\s*class\s+(\w+)/);
        if (!classMatch) {
            i++;
            continue;
        }

        const className = classMatch[1];
        const classStart = i;
        const classIndent = lines[i].length - lines[i].trimStart().length;

        // Check what class extends
        const extendsWidget = /extends\s+(StatelessWidget|StatefulWidget)/.test(lines[i]);
        const extendsState = /extends\s+State</.test(lines[i]);

        // We want all classes that might be widgets or have constructors with named params
        // Skip State classes as they don't use constructor params the same way

        // Find end of class by tracking braces from class start
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

        // Find ALL constructors (including named ones) within the class
        let allConstructorTexts = [];

        for (let j = classStart + 1; j < Math.min(classStart + 100, classEnd); j++) {
            const escapedName = escapeRegex(className);
            // Match: const ClassName(  or  ClassName(  or  const ClassName.namedCons(
            const consRegex = new RegExp('^\\s*(?:const\\s+)?' + escapedName + '(?:\\.\\w+)?\\s*\\(');
            if (consRegex.test(lines[j])) {
                let constructorText = '';
                let parenCount = 0;
                let foundCloseParen = false;
                for (let k = j; k < Math.min(j + 60, classEnd); k++) {
                    constructorText += lines[k] + '\n';
                    for (const ch of lines[k]) {
                        if (ch === '(') parenCount++;
                        if (ch === ')') parenCount--;
                    }
                    if (parenCount <= 0 && k >= j) {
                        foundCloseParen = true;
                    }
                    if (foundCloseParen) {
                        const trimmed = lines[k].trim();
                        if (trimmed.endsWith(';') || trimmed.endsWith('{')) {
                            break;
                        }
                    }
                }
                allConstructorTexts.push({ start: j, text: constructorText, isConst: /const\s+/.test(lines[j]) });
            }
        }

        if (allConstructorTexts.length === 0) {
            i++;
            continue;
        }

        // Use primary constructor (first one, unnamed)
        const primaryCons = allConstructorTexts[0];
        const constructorText = primaryCons.text;
        const constructorStart = primaryCons.start;
        const hasConstConstructor = primaryCons.isConst;

        if (!constructorText.includes('{')) {
            i++;
            continue;
        }

        // Only care about widget classes OR classes with const constructors
        if (!extendsWidget && !hasConstConstructor) {
            i++;
            continue;
        }

        // Combine all constructor texts to find all this.fieldName references
        const allConsText = allConstructorTexts.map(c => c.text).join('\n');

        // Extract this.fieldName from ALL constructors
        const thisFields = new Set();
        let m;
        const thisRegex = /this\.(\w+)/g;
        while ((m = thisRegex.exec(allConsText)) !== null) {
            thisFields.add(m[1]);
        }

        // Extract fields from initializer lists of ALL constructors
        for (const cons of allConstructorTexts) {
            let parenCount2 = 0;
            let closeParenPos = -1;
            for (let pos = 0; pos < cons.text.length; pos++) {
                if (cons.text[pos] === '(') parenCount2++;
                if (cons.text[pos] === ')') {
                    parenCount2--;
                    if (parenCount2 <= 0) {
                        closeParenPos = pos;
                        break;
                    }
                }
            }
            if (closeParenPos >= 0) {
                const initPart = cons.text.substring(closeParenPos);
                const initListRegex = /(\w+)\s*=/g;
                while ((m = initListRegex.exec(initPart)) !== null) {
                    thisFields.add(m[1]);
                }
            }
        }

        // Find final fields at class-body level
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

            // Skip if field is in any constructor or initializer list
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
                extendsWidget: extendsWidget,
                hasConstConstructor: hasConstConstructor,
                constructorLine: constructorStart + 1,
                constructor: constructorText.trim().substring(0, 500)
            });
        }

        i++;
    }
}

walkDir(baseDir);

console.log('');
console.log('=== Final fields NOT in any constructor and NOT initialized ===');
console.log('(Widgets and const-constructor classes, checking all named constructors)');
console.log('');

for (const r of results) {
    const relPath = r.file.replace(baseDir.replace(/\\/g, '/') + '/', '');
    const tag = r.extendsWidget ? '[WIDGET]' : '[CONST CLASS]';
    console.log(tag + ' FILE: ' + relPath);
    console.log('  Line ' + r.line + ': ' + r.field);
    console.log('  Class: ' + r.className);
    console.log('  Missing field: ' + r.fieldName + ' (type: ' + r.fieldType + ')');
    console.log('  Constructor at line ' + r.constructorLine + ':');
    const consLines = r.constructor.split('\n').slice(0, 10);
    for (const cl of consLines) {
        console.log('    ' + cl);
    }
    console.log('');
}

console.log('Total findings: ' + results.length);
