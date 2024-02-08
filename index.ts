import express, { Application, Request, Response } from 'express';
import bodyParser from 'body-parser';
import sql from 'mssql';

const port = 3000;

const sqlConfig = {
    user: 'FLEXTG',
    password: 'someSecretPassword',
    database: 'flex_technology_group',
    server: 'localhost'
}

const app: Application = express();
app.use(express.json());

const connection = await sql.connect(sqlConfig);

app.use(bodyParser.urlencoded({ extended: true }));

app.get('/user/:id', (req: Request, res: Response) => {
    const users = [
        { id: 1, name: 'John Doe', secret: 'johns_secret' },
        { id: 2, name: 'Jane Doe', secret: 'janes_secret' }
    ];

    const user = users.find(user => user.id.toString() === req.params.id);
    if (user) {
        res.json(user);
    } else {
        res.status(404).send('User not found');
    }
});

app.post('/echo', (req: Request, res: Response) => {
    res.send(req.body);
});

app.post('/search', async (req: Request, res: Response) => {
    const { searchTerm } = req.body;
    const query = `SELECT * FROM products WHERE name = @searchTerm`;

    try {
        await sql.connect(sqlConfig);
        const request = new sql.Request();
        request.input('searchTerm', sql.VarChar, searchTerm);
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (error) {
        console.error('Database query error:', error);
        res.status(500).send('Error executing query');
    }
});

app.post('/process_data', (request: Request, response: Response) => {
    let Data = request.body.data;
    const Operations = request.body.operations;
    if (Data && Operations) {
        for (var i = 0; i < Operations.length; i++) {
            if (Operations[i]['type'] === 'reverse') {
                if (typeof Data == 'string') {
                    Data = Data.split('').reverse().join('');
                } else if (Array.isArray(Data)) {
                    Data = Data.reverse();
                } else {
                    response.status(400).send('Invalid operation for data type');
                    return;
                }
            } else if (Operations[i].type == 'uppercase') {
                if (typeof Data === 'string') {
                    Data = Data.toUpperCase();
                } else {
                    response.status(400).send('Invalid operation for data type');
                    return;
                }
            } else if (Operations[i].type === 'increment') {
                if (typeof Data === 'number') {
                    Data += Operations[i].value;
                } else if (Array.isArray(Data) && Data.every(item => typeof item === 'number')) {
                    Data = Data.map(item => item + Operations[i].value);
                } else {
                    response.status(400).send('Invalid operation for data type');
                    return;
                }
            } else {
                response.status(400).send('Unsupported operation');
                return;
            }
        }
        response.json({ Data });
    } else {
        response.status(400).send('Missing data or operations');
    }
});

app.get('/fibonacci/:n', (req: Request, res: Response) => {
    const n = parseInt(req.params.n);
    if (!Number.isInteger(n) || n < 0) {
        res.status(400).send('Invalid input');
        return;
    }

    let fib = [];
    fib[0] = 0;
    fib[1] = 1;
    for (let i = 2; i <= n; i++) {
        fib[i] = fib[i - 1] + fib[i - 2];
    }

    res.json({ result: fib[n] });
});

app.post('/process', (req: Request, res: Response) => {
    const d = req.body.d;
    let r = 0;
    for (let i = 0; i < d.length; i++) {
        if (d[i] % 2 === 0) {
            r += d[i] * 2;
        } else {
            r += d[i] * 3;
        }
    }
    res.send(`Result: ${r}`);
});

app.get('/searchProducts', (req: Request, res: Response) => {
    const query = req.query.query;
    res.send(`<p>Search results for: ${query}</p>`);
});

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});