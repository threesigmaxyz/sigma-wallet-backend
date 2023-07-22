const express = require('express');
const app = express();
require('dotenv').config()

const { privateKey } = JSON.parse(process.env.PRIVATE_KEY);

const admin = require("firebase-admin");
const credentials = {projectId: process.env.PROJECT_ID, clientEmail: process.env.CLIENT_EMAIL, privateKey};
const cors=require("cors");

const corsOptions ={
   origin:'*', 
   credentials:true,            //access-control-allow-credentials:true
   optionSuccessStatus:200,
}

admin.initializeApp({
    credential: admin.credential.cert(credentials),
});

app.use(cors(corsOptions)) // Use this after the variable declaration

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = process.env.PORT || 3000;

app.post('/setTxData', async (req, res) => {
    try {
        const uid = req.body.uid;
        const txData = req.body.txData;
        await admin.auth().setCustomUserClaims(uid, { "txData": txData });
    } catch (error) {
        console.log(error);
    }
});

app.post('/getCustomToken', async (req, res) => {
    try {
        const uid = req.body.uid;
        const customToken = await admin.auth().createCustomToken(uid);
        res.send(JSON.stringify({customToken}));
    } catch (error) {
        console.log(error);
    }
});

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
    }
);