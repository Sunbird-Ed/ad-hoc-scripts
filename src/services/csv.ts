import fs from 'fs';
import { parse } from 'csv-parse';

function parseCsv(filePath: string): Promise<string[][]> {
    return new Promise((resolve, reject) => {
        const rows: string[][] = [];
        fs.createReadStream(filePath)
            .pipe(parse())
            .on('data', (row: string[]) => {
                rows.push(row);
            })
            .on('end', () => {
                resolve(rows);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

export default parseCsv;