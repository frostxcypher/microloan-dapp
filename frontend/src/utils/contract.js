import { ethers } from "ethers";
import MicroLoanABI from "../constants/MicroLoanABI.json";
import contractAddress from "../constants/contractAddress.json";

export async function getContractInstance() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask is not installed!");
  }

  // ethers v6 BrowserProvider
  const provider = new ethers.BrowserProvider(window.ethereum);
  
  // Request account access if not connected
  await provider.send("eth_requestAccounts", []);
  
  // Get active signer (Borrower wallet)
  const signer = await provider.getSigner();

  return new ethers.Contract(contractAddress.address, MicroLoanABI, signer);
}