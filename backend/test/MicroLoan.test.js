import { expect } from "chai";
import hre from "hardhat";

describe("MicroLoan Core Lifecycle", function () {
  let microLoan;
  let ethers;
  let admin, borrower, lender;
  let PRINCIPAL, REPAYMENT;
  const DURATION = 7 * 24 * 60 * 60; 

  before(async function () {
    // Initialize the network connection for Hardhat 3
    const connection = await hre.network.create();
    ethers = connection.ethers;

    PRINCIPAL = ethers.parseEther("1");
    REPAYMENT = ethers.parseEther("1.1");

    [admin, borrower, lender] = await ethers.getSigners();
    
    const MicroLoan = await ethers.getContractFactory("MicroLoan");
    microLoan = await MicroLoan.deploy();
  });

  it("Should allow a borrower to request a loan", async function () {
    await expect(microLoan.connect(borrower).requestLoan(PRINCIPAL, REPAYMENT, DURATION))
      .to.emit(microLoan, "Requested")
      .withArgs(1, borrower.address, PRINCIPAL);
  });

  it("Should allow a lender to fund the loan", async function () {
    await expect(microLoan.connect(lender).fund(1, { value: PRINCIPAL }))
      .to.emit(microLoan, "Funded")
      .withArgs(1, lender.address, PRINCIPAL);
  });

  it("Should allow the borrower to withdraw the funded principal", async function () {
    await expect(microLoan.connect(borrower).withdrawToBorrower(1))
      .to.emit(microLoan, "Withdrawn")
      .withArgs(1, borrower.address, PRINCIPAL);
  });

  it("Should allow the borrower to repay the loan", async function () {
    await expect(microLoan.connect(borrower).repay(1, { value: REPAYMENT }))
      .to.emit(microLoan, "Repaid")
      .withArgs(1, borrower.address, REPAYMENT);
  });
});