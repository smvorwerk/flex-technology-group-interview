
/**
 * Explanation of Current Functionality
 * The script is a basic web server built using Express.js, 
 * designed to handle various routes and perform operations such as:
 *      1. Database Connection
 *          Establishes a connection to a SQL database using provided configuration.
 *      2. User Retrieval
 *          A GET endpoint to retrieve a user by ID from a static array.
 *      3. Echo Service
 *          A POST endpoint that echoes the received request body.
 *      4. Database Search
 *          A POST endpoint to search for products in a database using a search term 
 *          from the request body.
 *      5. Data Processing
 *          A POST endpoint that performs operations on the provided data, such as reversing, 
 *          converting to uppercase, and incrementing values based on the operations array 
 *          in the request body.
 *      6. Fibonacci Sequence
 *          A GET endpoint that calculates the Fibonacci sequence up to the 'n-th' number 
 *          provided in the URL parameter.
 *      7. Data Processing (Alternate)
 *          Another POST endpoint that processes an array of numbers, doubling even numbers 
 *          and tripling odd numbers, then summing them up.
 *      8. Product Search
 *          A GET endpoint that returns a simple HTML response with the search query.
 * 
 * Suggestions for Improvements and Refactorings
 *  1. Remove Redundant Middleware
 *      The script uses both express.json() and body-parser.urlencoded(). 
 *      Since Express 4.16+, express.json() is built-in, making body-parser 
 *      unnecessary for JSON. For URL-encoded data, express.urlencoded() can 
 *      be used instead of body-parser.
 *  2. Database Connection Optimization
 *      The script redundantly connects to the database in the /search endpoint,
 *      despite having a global connection established at the start. This is 
 *      inefficient and can lead to unnecessary connections. A single, reusable 
 *      connection or a connection pool should be used instead.
 *  3. Secure Database Queries
 *      The script directly uses input from the request in SQL queries, which can 
 *      lead to SQL injection vulnerabilities. Using parameterized queries or stored
 *      procedures can mitigate this risk.
 *  4. Refactor Data Processing
 *      The /process_data endpoint uses a loop and multiple conditional statements to 
 *      apply operations on the data. This can be refactored to a more functional 
 *      style using a map-reduce pattern or similar, improving readability and efficiency.
 *  5. Improve Fibonacci Calculation
 *      The Fibonacci endpoint can be optimized by avoiding the storage of the entire
 *      sequence in an array, especially for large 'n', which can lead to high memory
 *      usage. A more space-efficient algorithm can be used.
 *  6. Error Handling
 *      The script lacks comprehensive error handling, especially for asynchronous 
 *      operations. Adding try-catch blocks or using Express's built-in error handling 
 *      middleware can improve resilience.
 *  7. Validation
 *      The script has minimal input validation, relying on simple checks. Incorporating 
 *      a library like Joi or express-validator can provide more robust validation and 
 *      error handling.
 *  8. Environment Variables
 *      The script includes sensitive information (database credentials) directly in the 
 *      code. Using environment variables or a configuration management library like dotenv
 *      for sensitive information is a best practice.
 *  9. Type Safety and Code Cleanliness
 *      Enhancing type definitions for request bodies, query parameters, and route parameters
 *      can improve type safety and code readability.
 */
import express, { Application, Request, Response } from 'express';
import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const port: string | number = process.env.PORT || 3000;

const sqlConfig: sql.config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    server: process.env.DB_HOST,
    pool: {
        min: 10,
        max: 100,
        acquireTimeoutMillis: 15000,
    },
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
}

const app: Application = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Solution 1: okay but not the best
 */
const pool = new sql.ConnectionPool(sqlConfig);
const poolConnect = pool.connect();
poolConnect.then(() => {
    console.log('Connected to MSSQL');
}).catch((err) => {
    console.error('Database Connection Failed', err);
});
/**
 * Solution 2: better (barely, just cleaner really)
 */
let pool2: sql.ConnectionPool;
sql.connect(sqlConfig).then(connection => {
    pool2 = connection;
}).catch(err => {
    console.error('Database connection error:', err);
});

/**
 * Solution 3: best
 */
import * as mssql from 'mssql';
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
    ],
});

class DatabaseManager {
    private pools: Map<string, mssql.ConnectionPool>;

    constructor(pools?: { [name: string]: mssql.config }) {
        this.pools = new Map();

        if (pools) {
            for (const [name, config] of Object.entries(pools)) {
                this.setPool(name, config);
            }
        }
    }

    public async setPool(name: string, config: mssql.config): Promise<void> {
        try {
            if (!name || !config) {
                throw new Error('Missing configuration details');
            }
            const pool = new mssql.ConnectionPool(config);
            const close = pool.close.bind(pool);

            pool.close = async (...args: any[]) => {
                logger.info(`Closing pool: ${name}`);
                this.pools.delete(name);
                return close(...args);
            };

            this.pools.set(name, pool);
            logger.info(`Pool set: ${name}`);
        } catch (error) {
            if (name && this.pools.has(name)) {
                logger.error(`Error setting pool ${name}.\nClosing pool...`);
                this.pools.delete(name);
            }
            logger.error(`Failed to set pool...${error}`);
            throw error;
        }
    }


    public async getPool(name: string, config?: mssql.config): Promise<mssql.ConnectionPool> {
        try {
            if (!this.pools.has(name)) {
                if (!config) {
                    throw new Error(`Configuration for pool ${name} not provided`);
                }
                await this.setPool(name, config);
            }
            const pool = this.pools.get(name)!;
            if (!pool.connected && !pool.connecting) {
                await pool.connect();
            }
            return pool;
        } catch (error) {
            logger.error(`Error getting pool ${name}: ${error}`);
            throw error; // Rethrow after logging
        }
    }

    
    public async closePool(name: string): Promise<void> {
        const pool = this.pools.get(name);
        if (!pool) {
            throw new Error(`Pool ${name} does not exist`);
        }
        await pool.close();
    }

    public async closeAllPools(): Promise<void> {
        await Promise.all(Array.from(this.pools.values()).map(pool => pool.close()));
    }

    private assignParams(request: mssql.Request, inputs: any[], outputs: any[]): void {
        [inputs, outputs].forEach((params, index) => {
            const operation = index === 0 ? 'input' : 'output';
            params.forEach(param => {
                if (param.type) {
                    request[operation](param.name, param.type, param.value);
                } else {
                    request[operation](param.name, param.value);
                }
            });
        });
    }

    public async runCommand(poolName: string, commandType: 'query' | 'execute', command: string, inputs: any[] = [], outputs: any[] = []): Promise<any> {
        try {
            const pool = await this.getPool(poolName);
            const request = pool.request();
            this.assignParams(request, inputs, outputs);
            logger.info(`Running command: ${commandType} on pool: ${poolName}`);
            return request[commandType](command);
        } catch (error) {
            logger.error(`Error running command on pool ${poolName}: ${error}`);
            throw error;
        }
    }

    private async retryOperation<T>(operation: () => Promise<T>, retries: number = 3, delay: number = 100): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (retries > 0) {
                logger.warn(`Operation failed, retrying... Attempts left: ${retries}. Error: ${error}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.retryOperation(operation, retries - 1, delay * 2); // Exponential backoff
            } else {
                logger.error(`Operation failed after retries: ${error}`);
                throw error;
            }
        }
    }

    public async executeWithEntity(poolName: string, commandType: 'query' | 'execute', command: string, entity: any, outputs: any[] = []): Promise<any> {
        try {
            logger.info(`Executing command with entity on pool: ${poolName}`);
            return this.runCommand(poolName, commandType, command, Object.keys(entity).map(key => ({ name: key, value: entity[key] })), outputs);
        } catch (error) {
            logger.error(`Error executing command with entity on pool ${poolName}: ${error}`);
            throw error;
        }
    }

    public async bulkInsert(poolName: string, tableName: string, columns: any[], entities: any[]): Promise<void> {
        try {
            const pool = await this.getPool(poolName);
            const table = new mssql.Table(tableName);
            columns.forEach(column => {
                table.columns.add(column.name, column.type, column.options || {});
            });
            entities.forEach(entity => {
                table.rows.add(...columns.map(col => entity[col.name]));
            });

            const request = pool.request();
            await request.bulk(table); // Perform bulk insert
            logger.info(`Bulk insert into ${tableName} completed on pool: ${poolName}`);
        } catch (error) {
            logger.error(`Error during bulk insert on pool ${poolName}: ${error}`);
            throw error;
        }
    }

    public async executeTransaction(poolName: string, operations: { commandType: 'query' | 'execute', command: string, inputs?: any[], outputs?: any[] }[]): Promise<void> {
        const pool = await this.getPool(poolName);
        const transaction = new mssql.Transaction(pool);
        await transaction.begin().catch(error => {
            logger.error(`Transaction begin error: ${error}`);
            throw error; // Ensure error is propagated after logging
        });

        try {
            for (const op of operations) {
                const request = new mssql.Request(transaction);
                this.assignParams(request, op.inputs || [], op.outputs || []);
                await request[op.commandType](op.command).catch(error => {
                    logger.error(`Transaction operation error: ${error}`);
                    throw error; // Stop execution and roll back on error
                });
            }
            await transaction.commit();
            logger.info('Transaction committed successfully');
        } catch (error) {
            await transaction.rollback().catch(rollbackError => {
                logger.error(`Transaction rollback error: ${rollbackError}`);
                // Consider further action to handle rollback failure
            });
            logger.error(`Transaction execution error: ${error}`);
            throw error; // Rethrow after handling and logging
        }
    }
}

const readwriteConfig: mssql.config = {
    readPool: { 
        user: process.env.DB_USER, 
        password: process.env.DB_PASSWORD, 
        server: process.env.DB_HOST, 
        database: process.env.DB_DATABASE,
        pool: {
            min: 10,
            max: 100,
            acquireTimeoutMillis: 15000,
        },
        options: {
            encrypt: true,
            trustServerCertificate: false
        }
    },
    writePool: { 
        user: process.env.DB_USER, 
        password: process.env.DB_PASSWORD, 
        server: process.env.DB_HOST, 
        database: process.env.DB_DATABASE,
        pool: {
            min: 10,
            max: 100,
            acquireTimeoutMillis: 15000,
        },
        options: {
            encrypt: true,
            trustServerCertificate: false
        }
    }
};

const dbManager = new DatabaseManager(readwriteConfig);

app.get('/user/:id', async (req: Request, res: Response) => {
    try {
        const userId: number = parseInt(req.params.id);
        if (!Number.isInteger(userId) || userId < 0) {
            res.status(400).send('Invalid input');
            throw new Error('Invalid input');
        }
            // Prepare SQL command and parameters
        const command = "SELECT * FROM Users WHERE Id = @UserId";
        const inputs = [{ name: "UserId", value: userId, type: mssql.Int }];

        // Use dbManager to execute the query
        const result = await dbManager.runCommand('readPool', 'query', command, inputs); 

        // Check if user was found
        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
        } else {
            res.status(404).send('User not found');
        }
    } catch (error) {
        logger.error('Error from userid request', {endpoint: '/user/:id', error: error, userId: req.params.id});
        res.status(500).send('Internal server error');
    }
});

app.post('/echo', (req: Request, res: Response) => {
    logger.info('Echo request received', { endpoint: '/echo', body: req.body });
    res.send(req.body);
});

app.post('/search', async (req: Request, res: Response) => {
    const { searchTerm } = req.body;
    // Validate the search term
    if (!searchTerm) {
        return res.status(400).send('Search term is required');
    }
    try {
        // Using DatabaseManager to execute the query
        const sqlQuery = 'SELECT * FROM products WHERE name = @searchTerm';
        const cleanedSearchTerm = searchTerm.replace(/[^a-zA-Z0-9\s\-]/g, ''); // Clean the search term
        const inputs = [{ name: 'searchTerm', value: cleanedSearchTerm, type: mssql.VarChar }];
        const result = await dbManager.runCommand('readPool', 'query', sqlQuery, inputs);
        if (result.recordset.length > 0) {
            res.json(result.recordset);
        } else {
            res.status(404).send('No products found');
        }
    } catch (error) {
        logger.error('Database query error:', { endpoint: '/search', error: error, searchTerm });
        res.status(500).send('Error executing query');
    }
});

app.post('/process_data', (req: Request, res: Response) => {
    let { data } = req.body;
    const { operations } = req.body;

    if (!data || !operations) {
        return res.status(400).send('Missing data or operations');
    }

    try {
        operations.forEach(operation => {
            switch (operation.type) {
                case 'reverse':
                    if (typeof data === 'string') {
                        data = data.split('').reverse().join('');
                    } else if (Array.isArray(data)) {
                        data = data.reverse();
                    } else {
                        throw new Error('Invalid operation for data type');
                    }
                    break;
                case 'uppercase':
                    if (typeof data === 'string') {
                        data = data.toUpperCase();
                    } else {
                        throw new Error('Invalid operation for data type');
                    }
                    break;
                case 'increment':
                    if (typeof data === 'number') {
                        data += operation.value;
                    } else if (Array.isArray(data) && data.every(item => typeof item === 'number')) {
                        data = data.map(item => item + operation.value);
                    } else {
                        throw new Error('Invalid operation for data type');
                    }
                    break;
                default:
                    throw new Error('Unsupported operation');
            }
        });

        res.json({ data });
    } catch (error) {
        logger.error('Data processing error:', { endpoint: '/process_data', error: error, body: req.body });
        res.status(400).send(error.message);
    }
});


app.get('/searchProducts', async (req: Request, res: Response) => {
    const query = req.query.query;
    if (!query) {
        return res.status(400).send('Query parameter is required');
    }

    try {
        const sqlQuery = 'SELECT * FROM Products WHERE ProductName LIKE @Query';
        const inputs = [{ name: 'Query', value: `%${query}%`, type: mssql.VarChar }];
        const result = await dbManager.runCommand('readPool', 'query', sqlQuery, inputs);

        if (result.recordset.length > 0) {
            let html = '<ul>';
            result.recordset.forEach(product => {
                html += `<li>${product.ProductName} - ${product.Description}</li>`; // Adjust according to your actual columns
            });
            html += '</ul>';
            res.send(html);
        } else {
            res.status(404).send('No products found');
        }
    } catch (error) {
        logger.error('Database query error:', { endpoint: '/searchProducts', error: error, query });
        res.status(500).send('Internal server error');
    }
});

/**
 * Okay Solution
 */
app.get('/fibonacci-1/:n', async (req: Request, res: Response) => {
    const n = parseInt(req.params.n);
    if (!Number.isInteger(n) || n < 0) {
        res.status(400).send('Invalid input');
        return;
    }
    // Calculate Fibonacci number
    let fib: number[] = [0, 1];
    for (let i = 2; i <= n; i++) {
        fib[i] = fib[i - 1] + fib[i - 2];
    }
    // Log the request and result to the database (hypothetical since we haven't actually provided db access)
    try {
        const logQuery = 'INSERT INTO CalculationLogs (Type, Input, Result) VALUES (@Type, @Input, @Result)';
        const inputs = [
            { name: 'Type', value: 'Fibonacci', type: mssql.VarChar },
            { name: 'Input', value: n, type: mssql.Int },
            { name: 'Result', value: fib[n], type: mssql.Int }
        ];

        await dbManager.runCommand('writePool', 'query', logQuery, inputs);
    } catch (error) {
        // Handle logging error, possibly ignore or log to a file
    }

    res.json({ result: fib[n] });
});


/**
 * Better Solution
 */
const memo: Record<number, number> = {};
const fibMemo = (n: number): number => {
    if (n in memo) return memo[n];
    if (n <= 2) return 1;
    memo[n] = fibMemo(n - 1) + fibMemo(n - 2);
    return memo[n];
};

app.get('/fibonacci-2/:n', (req: Request, res: Response) => {
    const n = parseInt(req.params.n);
    if (!Number.isInteger(n) || n < 0) {
        return res.status(400).send('Invalid input');
    }
    try {
        const result = fibMemo(n);
        res.json({ result });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal server error');
    }
});

/**
 * Best Solution
 */
const sqrt5 = Math.sqrt(5);
const phi = (1 + sqrt5) / 2;

// Binet's Formula Function O(1)
const fibBinet = (n: number): number => {
    if (n === 0) return 0;
    return Math.round(Math.pow(phi, n) / sqrt5);
};
// Iterative Matrix Exponentiation Function O(log n)
const multiplyMatrices = (a: number[][], b: number[][]): number[][] => {
    let result = [
        [0, 0],
        [0, 0]
    ];
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
            for (let k = 0; k < 2; k++) {
                result[i][j] += a[i][k] * b[k][j];
            }
        }
    }
    return result;
};

// Matrix Exponentiation Function O(log n)
const matrixPower = (base: number[][], exponent: number): number[][] => {
    let result = [
        [1, 0],
        [0, 1]
    ]; // Identity matrix

    while (exponent > 0) {
        if (exponent % 2 === 1) {
            result = multiplyMatrices(result, base);
        }
        base = multiplyMatrices(base, base);
        exponent = Math.floor(exponent / 2);
    }

    return result;
};

// Matrix Exponentiation Fibonacci Function O(log n)
const fibMatrix = (n: number): number => {
    if (n <= 1) return n;

    const base = [
        [1, 1],
        [1, 0]
    ];

    const result = matrixPower(base, n - 1);
    return result[0][0];
};

// Hybrid Fibonacci Function
const fibHybrid = (n: number): number => {
    // Threshold for switching between Binet's formula and matrix exponentiation
    const threshold = 70; // Example threshold, adjust based on precision needs
    if (n < threshold) {
        return fibBinet(n);
    } else {
        return fibMatrix(n);
    }
};

const fibHybridMemo = (n: number): number => {
    if (n in memo) return memo[n];
    memo[n] = fibHybrid(n);
    return memo[n];
};

app.get('/fibonacci-3/:n', (req: Request, res: Response) => {
    const n = parseInt(req.params.n);
    if (!Number.isInteger(n) || n < 0) {
        return res.status(400).send('Invalid input');
    }
    try {
        const result = fibHybridMemo(n);
        res.json({ result });
    } catch (error) {
        logger.error('Fibonacci calculation error:', { endpoint: '/fibonacci-3/:n', error: error, n });
        res.status(500).send('Internal server error');
    }
});

app.post('/process', (req: Request, res: Response) => {
    const d = req.body.d;

    // Input validation
    if (!Array.isArray(d) || !d.every(Number.isInteger)) {
        return res.status(400).send('Invalid input: "d" must be an array of integers');
    }

    try {
        // Processing logic
        const result = d.reduce((acc, cur) => {
            return acc + (cur % 2 === 0 ? cur * 2 : cur * 3);
        }, 0);
        logger.info('Processing request received', { input: d, result });
        res.json({ result });
    } catch (error) {
        logger.error('Error processing data:', { endpoint: '/process', error, body: req.body });
        res.status(500).send('Internal server error');
    }
});


app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});