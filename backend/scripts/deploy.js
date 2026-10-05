import hre from "hardhat";

async function main() {
  console.log("Deploying MicroLoan contract to Sepolia...");

  // Explicitly initialize the network connection for Hardhat 3
  const connection = await hre.network.create();
  const ethers = connection.ethers;

  const MicroLoan = await ethers.getContractFactory("MicroLoan");
  const microLoan = await MicroLoan.deploy();

  await microLoan.waitForDeployment();

  const contractAddress = await microLoan.getAddress();
  console.log(`✅ MicroLoan officially deployed to Sepolia at address: ${contractAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});