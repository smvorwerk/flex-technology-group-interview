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

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});