const csv = require('csv-parser');
const fs = require('fs');
const { parse } = require("json2csv");

async function readCSV(filePath) {
    const results = [];
    
    try {
        const path = fs.createReadStream(filePath)
            .on('error', error => { throw error; });

        await new Promise((resolve, reject) => {
            path.pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', () => resolve())
                .on('error', (error) => reject(error));
        });
        
        return results;
    } catch (error) {
        throw error;
    }
}

async function writeCSV(filename, data) {
    const csv = parse(data);
    fs.writeFileSync(filename, csv);
  }

module.exports = {readCSV,writeCSV};