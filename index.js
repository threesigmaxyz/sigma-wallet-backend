const express = require('express');
const app = express();
require('dotenv').config()
const { privateKey } = JSON.parse(process.env.PRIVATE_KEY);
const admin = require("firebase-admin");
const credentials = { projectId: process.env.PROJECT_ID, clientEmail: process.env.CLIENT_EMAIL, privateKey };
const cors = require("cors");
const {ethers} = require('ethers');
const entrypointAbi = require('./abi/IEntryPoint.json').abi;
const walletAbi = require('./abi/SigmaWallet.json').abi;
const walletFactoryAbi = require('./abi/SigmaWalletFactory.json').abi;

const zksync = require('./utils/zksync');

const chainData = { 
    "Sepolia": { 
        rpcUrl: process.env.SEPOLIA_RPC_URL, 
        entrypoint: "0x0576a174D229E3cFA37253523E645A78A0C91B57",
        factory: process.env.SEPOLIA_WALLET_FACTORY_ADDRESS
    } 
};

const bundlerPrivateKey = process.env.BUNDLER_PRIVATE_KEY;

const corsOptions = {
    origin: '*',
    credentials: true,            //access-control-allow-credentials:true
    optionSuccessStatus: 200,
}

admin.initializeApp({
    credential: admin.credential.cert(credentials),
});

app.use(cors(corsOptions)) // Use this after the variable declaration

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = process.env.PORT || 3002;

app.post('/setTxData', async (req, res) => {
    console.log("request", req.body.uid, req.body.txData);
    try {
        const uid = req.body.uid;
        const txData = req.body.txData;
        await admin.auth().setCustomUserClaims(uid, { "txData": txData });
        res.sendStatus(200);
    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }
});

app.post('/getCustomToken', async (req, res) => {
    console.log("request", req.body.uid);
    try {
        const uid = req.body.uid;
        const customToken = await admin.auth().createCustomToken(uid);
        res.send(JSON.stringify({ customToken }));
    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }
});

app.post('/sendTxERC4337', async (req, res) => {
    const sendUserOperation = async (entrypoint, userWalletAddress, nonce, initCode, calldata, signature, wallet) => {
        const userOperation = [{
            sender: userWalletAddress,
            nonce: nonce,
            initCode: initCode,
            callData: calldata,
            callGasLimit: 10e6,
            verificationGasLimit: 10e6,
            preVerificationGas: 0,
            maxFeePerGas: 20e9,
            maxPriorityFeePerGas: 2e9,
            paymasterAndData: "0x",
            signature: signature
        }];
        return await entrypoint.handleOps(userOperation, wallet.address);
    }

    try {
        console.log("sendTxERC4337", req.body.chain, req.body.uid, req.body.txData);
        const chain = req.body.chain;
        const calldata = req.body.txData;
        const uid = req.body.uid;
        const signature = req.body.signature;
        const rpcUrl = chainData[chain].rpcUrl;
        const entrypointAddress = chainData[chain].entrypoint;
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(bundlerPrivateKey, provider);
        const walletFactory = new ethers.Contract(chainData[chain].factory, walletFactoryAbi, wallet); 
        const entrypoint = new ethers.Contract(entrypointAddress, entrypointAbi, wallet);
        const userWalletAddress = await walletFactory.getAddress(uid, 0);
        const userWallet =  new ethers.Contract(userWalletAddress, walletAbi, wallet);
        const isDeployed = await provider.getCode(userWalletAddress) != "0x";
        const nonce = isDeployed ? await userWallet.getNonce() : 0;

        if (!isDeployed) {
            const abiCoder = new ethers.utils.AbiCoder();
            const createAcountCalldata = "0x6586ace6" + abiCoder.encode(["string", "uint"], [uid, 0]).slice(2);
            const initCode =  ethers.utils.solidityPack(["address", "bytes"], [walletFactory.address, createAcountCalldata]);
            await sendUserOperation(entrypoint, userWalletAddress, nonce, initCode, "0x", signature, wallet);
        }
        const tx = await sendUserOperation(entrypoint, userWalletAddress, nonce, "0x", calldata, signature, wallet);
        const receipt = await tx.wait();
        res.send({txHash: receipt.transactionHash});
    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }
});

app.get('/zksync/:userId', async (req, res) => {
    const userId = req.params.userId;
    console.log('/zksync/:userId >', userId);

    try {
        const hasAccount = await zksync.isAccountDeployed(userId);
        if (!hasAccount) {
            console.log('Deploying account contract for:', userId);
            await zksync.deployAccountContract(userId);
        }

        const address = await zksync.getAccountAddress(userId);
        console.log('Account contract at:', address);
        res.json({
            address: address,
        });
    
    } catch (error) {
        console.log(error);
        res.status(500).send('Server Error');
    }
});

app.post('/zksync/tx', async (req, res) => {
    console.log("/zksync/tx", req.body.uid, req.body.txData);

    try {
        const hasAccount = await zksync.isAccountDeployed(req.body.uid);
        if (!hasAccount) {
            res.status(400).send('Account not deployed');
        }

        await zksync.sendTx(
            req.body.uid,
            req.body.recipient,
            req.body.txData,
            req.body.value,
            req.body.signature
        );
        
        res.status(200);

    } catch (error) {
        console.log(error);
        res.status(500).send('Server Error');
    }
});

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});