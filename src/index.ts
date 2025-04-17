import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import PQueue from 'p-queue';
import fs from 'fs';
import { generate_pack } from './generator.js';

dotenv.config();
const app = express();

app.use(express.json());
app.use(cors())

const db = new sqlite3.Database('database.db');
const queue = new PQueue({ concurrency: 1 });

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS packs (id TEXT PRIMARY KEY, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, ip TEXT, status TEXT)`);
    if(!fs.existsSync('ziped_skins')){
        fs.mkdirSync('ziped_skins');
    }
})

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.json({ service : 'API', status: 'running' });
});

app.post('/generate', async (req, res) => {
    if(!req.body) {
        res.status(400).json({ error: 'body is required' });
        return;
    }
    if(!req.body.names){
        res.status(400).json({ error: 'names is required' });
        return;
    }
    const names = req.body.names;
    if(!Array.isArray(names)){
        res.status(400).json({ error: 'names must be an array' });
        return;
    }
    if(names.length > 20){
        res.status(400).json({ error: 'names must be less than 20' });
        return;
    }
    if(names.length < 1){
        res.status(400).json({ error: 'names must be at least 1' });
        return;
    }
    const id = gen_id();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if(!await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM packs WHERE ip = ?`, [ip], (err, rows) => {
            if (err) {
                console.error(err.message);
                res.status(500).json({ error: 'Error getting pack' });
                resolve(false);
            }
            if (rows) {
                for(const row of rows){
                    if((row as any).status == "GENERATING" || (row as any).status == "WAITING"){
                        res.status(400).json({ error: 'You already have a pack in queue' });
                        resolve(false);
                    }
                }
            }
            resolve(true);
        })
    })) return;

    db.run(`INSERT INTO packs (id, ip, status) VALUES (?, ?, ?)`, [id, ip, "WAITING"], function(err) {
        if (err) {
            console.error(err.message);
            res.status(500).json({ error: 'Error creating pack' });
            return;
        }
        res.json({ id: id, status: "WAITING", packsWating: queue.size });
        add_pack_to_queue(id, names);
    });

})

app.get('/status/:id', (req, res) => {
    const id = req.params.id;
    db.get(`SELECT * FROM packs WHERE id = ?`, [id], (err, row) => {
        if (err) {
            res.status(500).json({ error: 'Error getting pack' });
            return;
        }
        if (!row) {
            res.status(404).json({ error: 'Pack not found' });
            return;
        }
        const row_data = row as any;
        res.json({ id: row_data.id, status: row_data.status, created_at: row_data.created_at, packsWating: queue.size });
    });
})

app.get('/download/:id', (req, res) => {
    const id = req.params.id;
    db.get(`SELECT * FROM packs WHERE id = ?`, [id], (err, row) => {
        if (err) {
            res.status(500).json({ error: 'Error getting pack' });
            return;
        }
        if (!row) {
            res.status(404).json({ error: 'Pack not found' });
            return;
        }
        const row_data = row as any;
        if(fs.existsSync(`ziped_skins/${row_data.id}/skin_pack.zip`)){
            res.download(`ziped_skins/${row_data.id}/skin_pack.zip`, `skin_pack_${row_data.id}.zip`, (err) => {
                if (err) {
                    console.error(err);
                    res.status(500).json({ error: 'Error downloading pack' });
                }
                db.run(`DELETE FROM packs WHERE id = ?`, [id], (err) => {
                    if (err) {
                        console.error(err.message);
                    }
                    fs.rmSync(`ziped_skins/${row_data.id}`, { recursive: true, force: true });
                });
            });
        }else{
            res.status(404).json({ error: 'Pack not ready' });
        }
    });
})

app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
})

const gen_id = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
const add_pack_to_queue = async (id: string, names: string[]) => {
    await queue.add(async () =>{
        db.run(`UPDATE packs SET status = ? WHERE id = ?`, ["GENERATING", id]);
        generate_pack(names, id)
    })
    db.run(`UPDATE packs SET status = ? WHERE id = ?`, ["READY", id]);
    db.all(`SELECT * FROM packs`, [], (err, rows) => {
        if(rows.length > 40){
            const oldest = rows.reduce((prev:any, current:any) => (prev.created_at < current.created_at) ? prev : current);
            db.run(`DELETE FROM packs WHERE id = ?`, [(oldest as any).id], (err) => {
                if (err) {
                    console.error(err.message);
                }
            });
            fs.rmSync(`ziped_skins/${(oldest as any).id}`, { recursive: true, force: true });
        }
    });
}