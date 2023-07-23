const {Provider, Wallet, utils} = require("zksync-web3");
const {ethers} = require('ethers');

require('dotenv').config()
const rpcUrl = process.env.ZKSYNC_RPC_URL;              // http://localhost:3050
const deployerKey = process.env.ZKSYNC_DEPLOYER_KEY;    // "0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110"

const provider = new Provider(rpcUrl);
const wallet = new Wallet(deployerKey).connect(provider);

const AUTH_PROVIDER_ADDRESS = "0x111C3E89Ce80e62EE88318C2804920D4c96f92bb";
const DEPLOYEMENT_SALT = "0x0000000000000000000000000000000000000000000000000000000000000000";

const factoryAbi = require('../abi/zksync/Factory.json').abi;
const factoryContract = new ethers.Contract(
    process.env.ZKSYNC_ACCOUNT_FACTORY_ADDRESS,
    factoryAbi,
    wallet
);

async function getAccountAddress(userId) {
    const abiCoder = new ethers.utils.AbiCoder();

    const accountAddress = utils.create2Address(
        factoryContract.address,
        await factoryContract.aaBytecodeHash(), // '0x010007250f78da173566ca7a7ef38ae9e00dade014651d6cd7f132e71d499678'
        DEPLOYEMENT_SALT,
        abiCoder.encode(["string", "address"], [userId, AUTH_PROVIDER_ADDRESS])
    );

    return accountAddress;
};

async function deployAccountContract(userId) {
    const deploymentTx = await factoryContract.deployAccount(userId, AUTH_PROVIDER_ADDRESS, DEPLOYEMENT_SALT, {
        gasLimit: 1000000,
    });

    const accountAddress = await getAccountAddress(userId);

    const faucetTx = await wallet.sendTransaction({
        to: accountAddress,
        value: ethers.utils.parseEther("0.1"),
    });
};

async function isAccountDeployed(userId) {
    try {    
        const address = await getAccountAddress(userId);
        const code = await provider.getCode(address);
        return code !== '0x'
    } catch (error) {
        console.error('Error occurred:', error);
        return false;
    }
};

async function sendTx(userId, data, value, signature) {
    const sender = await getAccountAddress(userId);
    const chainId = (await provider.getNetwork()).chainId;
    const nonce = await provider.getTransactionCount(sender);
    const gasPrice = await provider.getGasPrice();
    console.log(chainId, nonce, gasPrice.toString());

    tx = {
        from: sender,
        to: sender, // TODO change to recipient
        gasLimit: 10e6,
        gasPrice: gasPrice,
        chainId: chainId,
        nonce: nonce,
        type: 113,
        data: data,
        customData: {
            gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
            customSignature: signature,
        },
        value: ethers.BigNumber.from(value),
    }

    // const gasLimit = await provider.estimateGas(tx);
    //tx = {
    //    ...tx,
    //    gasLimit: gasLimit,
    //};

    const sentTx = await provider.sendTransaction(utils.serialize(tx));
}

module.exports = {
    getAccountAddress,
    deployAccountContract,
    isAccountDeployed,
    sendTx
};