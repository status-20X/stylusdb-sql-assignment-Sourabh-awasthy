const readline = require('readline');
const { executeSELECTQuery, executeINSERTQuery, executeDELETEQuery } = require('./queryExecutor.js');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.setPrompt('SQL> ');
console.log('SQL Query Engine CLI. Enter your SQL commands, or type "exit" to quit.');

rl.prompt();

rl.on('line', async (line) => {
    if (line.toLowerCase() === 'exit') {
        rl.close();
        return;
    }

    try {
        // Parsing the first word of the command to determine the query type
        const queryType = line.trim().split(' ')[0].toUpperCase();

        switch (queryType) {
            case 'SELECT':
                // Execute SELECT query
                const selectResult = await executeSELECTQuery(line);
                console.log(selectResult);
                break;
            case 'INSERT':
                // Execute INSERT query
                const insertResult = await executeINSERTQuery(line);
                console.log(insertResult);
                break;
            case 'DELETE':
                // Execute DELETE query
                const deleteResult = await executeDELETEQuery(line);
                console.log(deleteResult);
                break;
            default:
                console.error('Unsupported query type:', queryType);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }

    rl.prompt();
}).on('close', () => {
    console.log('Exiting SQL CLI');
    process.exit(0);
});