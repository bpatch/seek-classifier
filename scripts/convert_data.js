const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'Spreadsheet - list of employers 2 April 2026.xlsx');
const outputPath = path.join(__dirname, '..', 'data', 'employers.json');

// Ensure data directory exists
const dataDir = path.dirname(outputPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log(`Reading ${inputPath}...`);
const wb = xlsx.readFile(inputPath);
const sheetName = wb.SheetNames[0];
const data = xlsx.utils.sheet_to_json(wb.Sheets[sheetName]);

// Extract unique agencies and their types
const agenciesMap = new Map();

data.forEach(row => {
  if (row.Agency && typeof row.Agency === 'string') {
    const name = row.Agency.trim();
    const type = row['Employer type'] === 'Public service' ? 'Public Service' : 'Public Sector';
    if (!agenciesMap.has(name)) {
      agenciesMap.set(name, type);
    }
  }
});

const agenciesArray = Array.from(agenciesMap.entries())
  .map(([name, type]) => ({ name, type }))
  .sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync(outputPath, JSON.stringify(agenciesArray, null, 2), 'utf-8');
console.log(`Successfully extracted ${agenciesArray.length} employers to ${outputPath}`);
