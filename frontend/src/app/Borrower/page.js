"use client";

import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";

import contractData from "@/constants/contractAddress.json";

// Safe Contract Address Resolution
const CONTRACT_ADDRESS = contractData?.address || contractData;

// Human-Readable ABI (Bypasses JSON import issues)
const ABI = [
  "function loanCounter() view returns (uint256)",
  "function loans(uint256) view returns (address borrower, address lender, uint256 principal, uint256 repaymentAmount, uint256 dueDate, uint8 status)",
  "function requestLoan(uint256 principal, uint256 repaymentAmount, uint256 dueDate) returns (uint256)",
  "function withdrawToBorrower(uint256 loanId)",
  "function repay(uint256 loanId) payable"
];

// Sepolia Chain ID
const SEPOLIA_CHAIN_ID = "0xaa36a7";

// Contract enum status mapping
const STATUS = {
  Requested: 0,
  Funded: 1,
  Withdrawn: 2,
  Repaid: 3,
  Defaulted: 4,
};

export default function BorrowerDashboard() {
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletBalance, setWalletBalance] = useState("0");

  // Borrower Specific Loan Lists
  const [myLoans, setMyLoans] = useState([]);

  // Form Input States
  const [principal, setPrincipal] = useState("0.01");
  const [interestPercent, setInterestPercent] = useState(10);
  const [durationDays, setDurationDays] = useState(7);

  // Modal / Action States
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [actionType, setActionType] = useState(null); // 'WITHDRAW' or 'REPAY'
  const [processing, setProcessing] = useState(false);

  const [loadingLoans, setLoadingLoans] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("request");

  // Dynamic Payback calculation
  const calculatedPayback = principal && !isNaN(parseFloat(principal))
    ? (parseFloat(principal) * (1 + interestPercent / 100)).toFixed(4)
    : "0.0000";

  // --------------------------------------------------
  // PROVIDER & NETWORK HELPERS
  // --------------------------------------------------

  function getProvider() {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("MetaMask is not installed.");
    }
    return new ethers.BrowserProvider(window.ethereum);
  }

  async function switchToSepolia() {
    if (!window.ethereum) throw new Error("MetaMask is not installed.");
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    } catch (switchError) {
      if (switchError.code === 4001) throw new Error("You rejected the Sepolia network switch.");
      if (switchError.code === 4902) throw new Error("Sepolia test network is not enabled in MetaMask.");
      throw new Error("Could not switch to Sepolia.");
    }
  }

  // --------------------------------------------------
  // LOAD BORROWER LOANS FROM CONTRACT
  // --------------------------------------------------

  const loadLoans = useCallback(async (address = walletAddress) => {
    if (typeof window === "undefined" || !window.ethereum || !address) return;

    try {
      setLoadingLoans(true);
      setError("");

      if (!CONTRACT_ADDRESS) {
        throw new Error("Contract address is missing in constants/contractAddress.json");
      }

      const provider = getProvider();
      const network = await provider.getNetwork();

      if (network.chainId !== 11155111n) {
        await switchToSepolia();
        return;
      }

      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
      const count = await contract.loanCounter();
      const totalLoans = Number(count);

      const borrowerLoans = [];

      for (let i = 1; i <= totalLoans; i++) {
        try {
          const loan = await contract.loans(i);

          const borrower = loan.borrower || loan[0];
          const lender = loan.lender || loan[1];
          const loanPrincipal = loan.principal || loan[2];
          const repayment = loan.repaymentAmount || loan[3];
          const dueDate = loan.dueDate || loan[4];
          const rawStatus = loan.status !== undefined ? loan.status : loan[5];
          const status = Number(rawStatus ?? 0);

          if (borrower && borrower.toLowerCase() === address.toLowerCase()) {
            borrowerLoans.push({
              id: i,
              borrower,
              lender,
              principalWei: loanPrincipal ? loanPrincipal.toString() : "0",
              repaymentWei: repayment ? repayment.toString() : "0",
              principal: loanPrincipal ? ethers.formatEther(loanPrincipal) : "0",
              repayment: repayment ? ethers.formatEther(repayment) : "0",
              dueDate: dueDate ? new Date(Number(dueDate) * 1000).toLocaleDateString() : "N/A",
              status,
            });
          }
        } catch (loanErr) {
          console.error(`Could not load loan #${i}:`, loanErr);
        }
      }

      setMyLoans(borrowerLoans);
    } catch (err) {
      console.error("Load loans error:", err);
      setError(err.message || "Could not load loans.");
    } finally {
      setLoadingLoans(false);
    }
  }, [walletAddress]);

  // --------------------------------------------------
  // CONNECT WALLET
  // --------------------------------------------------

  async function connectWallet() {
    try {
      setError("");
      if (!window.ethereum) return alert("Please install MetaMask first.");

      await switchToSepolia();
      const provider = getProvider();

      const accounts = await provider.send("eth_requestAccounts", []);
      if (!accounts || accounts.length === 0) return;

      const address = accounts[0];
      const balance = await provider.getBalance(address);

      setWalletAddress(address);
      setWalletBalance(Number(ethers.formatEther(balance)).toFixed(4));
      setWalletConnected(true);

      await loadLoans(address);
    } catch (err) {
      console.error("Wallet connection error:", err);
      setError(err.message || "Wallet connection failed.");
    }
  }

  // --------------------------------------------------
  // REQUEST A LOAN
  // --------------------------------------------------

  async function handleRequestLoan(e) {
    e.preventDefault();
    try {
      setProcessing(true);
      setError("");

      if (!walletConnected) throw new Error("Please connect your wallet first.");
      await switchToSepolia();

      const provider = getProvider();
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      const principalWei = ethers.parseUnits(principal.toString(), 18);
      const repaymentWei = ethers.parseUnits(calculatedPayback.toString(), 18);
      const dueDateUnix = Math.floor(Date.now() / 1000) + parseInt(durationDays) * 86400;

      const tx = await contract.requestLoan(principalWei, repaymentWei, dueDateUnix);
      alert(`Loan request submitted!\nTx Hash: ${tx.hash}\nWaiting for confirmation...`);

      await tx.wait();
      alert("🚀 Your loan request is live on Sepolia!");

      setActiveTab("my-loans");
      await loadLoans(walletAddress);
    } catch (err) {
      console.error(err);
      alert(err.reason || err.message || "Loan request failed.");
    } finally {
      setProcessing(false);
    }
  }

  // --------------------------------------------------
  // WITHDRAW LOAN
  // --------------------------------------------------

  async function executeWithdraw() {
    if (!selectedLoan) return;

    try {
      setProcessing(true);
      const provider = getProvider();
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      const tx = await contract.withdrawToBorrower(selectedLoan.id);
      alert(`Withdrawal submitted!\nTx Hash: ${tx.hash}\nWaiting for confirmation...`);

      await tx.wait();
      alert(`🎉 Funds for Loan #${selectedLoan.id} transferred to your wallet!`);

      closeModal();
      await loadLoans(walletAddress);
    } catch (err) {
      console.error(err);
      alert(err.reason || err.message || "Withdrawal failed.");
    } finally {
      setProcessing(false);
    }
  }

  // --------------------------------------------------
  // REPAY LOAN
  // --------------------------------------------------

  async function executeRepay() {
    if (!selectedLoan) return;

    try {
      setProcessing(true);
      const provider = getProvider();
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      const repayWei = BigInt(selectedLoan.repaymentWei);

      const tx = await contract.repay(selectedLoan.id, { value: repayWei });
      alert(`Repayment transaction submitted!\nTx Hash: ${tx.hash}\nWaiting for confirmation...`);

      await tx.wait();
      alert(`✅ Loan #${selectedLoan.id} has been fully settled!`);

      closeModal();
      await loadLoans(walletAddress);
    } catch (err) {
      console.error(err);
      alert(err.reason || err.message || "Repayment failed.");
    } finally {
      setProcessing(false);
    }
  }

  // --------------------------------------------------
  // EVENT LISTENERS
  // --------------------------------------------------

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (!accounts || accounts.length === 0) {
        setWalletConnected(false);
        setWalletAddress("");
        setWalletBalance("0");
        setMyLoans([]);
        return;
      }
      const address = accounts[0];
      setWalletAddress(address);
      setWalletConnected(true);
      await loadLoans(address);
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    return () => {
      if (window.ethereum?.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      }
    };
  }, [loadLoans]);

  // --------------------------------------------------
  // UI HELPERS
  // --------------------------------------------------

  function shortenAddress(addr) {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  function openActionModal(loan, type) {
    setSelectedLoan(loan);
    setActionType(type);
  }

  function closeModal() {
    if (processing) return;
    setSelectedLoan(null);
    setActionType(null);
  }

  function getStatusBadge(status) {
    switch (status) {
      case STATUS.Requested:
        return <span className="px-3 py-1 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">Pending Lender</span>;
      case STATUS.Funded:
        return <span className="px-3 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">Ready to Withdraw</span>;
      case STATUS.Withdrawn:
        return <span className="px-3 py-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">Active / Unpaid</span>;
      case STATUS.Repaid:
        return <span className="px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 rounded-full">Repaid & Closed</span>;
      case STATUS.Defaulted:
        return <span className="px-3 py-1 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 rounded-full">Defaulted</span>;
      default:
        return <span className="px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-500 rounded-full">Unknown</span>;
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f6f9] text-slate-800 font-sans">
      
      {/* DARK SIDEBAR (Matches Lender Theme) */}
      <aside className="fixed left-0 top-0 hidden h-screen w-64 bg-[#0b1329] md:block text-white">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight">MicroLoan</h1>
          <p className="text-xs text-slate-400 mt-1">Borrower Portal</p>
        </div>

        <nav className="mt-4 px-3 space-y-1">
          <button
            onClick={() => setActiveTab("request")}
            className={`w-full px-4 py-3 text-left font-medium text-sm rounded-xl transition-all ${
              activeTab === "request"
                ? "bg-blue-600 text-white font-semibold"
                : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
            }`}
          >
            Request New Loan
          </button>

          <button
            onClick={() => setActiveTab("my-loans")}
            className={`w-full px-4 py-3 text-left font-medium text-sm rounded-xl transition-all ${
              activeTab === "my-loans"
                ? "bg-blue-600 text-white font-semibold"
                : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
            }`}
          >
            My Loan Requests ({myLoans.length})
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="min-h-screen md:ml-64 p-8 space-y-6">
        
        {/* HEADER BAR */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white px-6 py-5 rounded-2xl border border-slate-200/80 shadow-xs gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Borrower Dashboard</h2>
            <p className="text-sm text-slate-500 mt-0.5">Request micro-loans & manage active debt obligations</p>
          </div>

          <button
            onClick={connectWallet}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-all shadow-xs cursor-pointer flex items-center gap-2"
          >
            {walletConnected ? `${shortenAddress(walletAddress)} ✓` : "Connect Wallet"}
          </button>
        </header>

        {/* ERROR NOTIFICATION */}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 font-medium">
            ⚠️ {error}
          </div>
        )}

        {/* TOP STAT CARDS (Exact Match to Lender Dashboard Cards) */}
        <section className="grid gap-5 sm:grid-cols-3">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
            <p className="text-xs font-semibold text-slate-500">Wallet Balance</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">
              {walletConnected ? `${walletBalance} ETH` : "0.0 ETH"}
            </h3>
            <p className="mt-2 text-xs font-medium text-emerald-600">Sepolia balance</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
            <p className="text-xs font-semibold text-slate-500">Total Active Requests</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">{myLoans.length}</h3>
            <p className="mt-2 text-xs font-medium text-blue-600">Issued by current wallet</p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
            <p className="text-xs font-semibold text-slate-500">Pending Withdrawals</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">
              {myLoans.filter((l) => l.status === STATUS.Funded).length}
            </h3>
            <p className="mt-2 text-xs font-medium text-slate-500">Funded loans awaiting transfer</p>
          </div>
        </section>

        {/* TAB 1: CREATE REQUEST STUDIO */}
        {activeTab === "request" && (
          <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs max-w-2xl space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900">Interactive Loan Request Studio</h3>
              <p className="text-sm text-slate-500 mt-1">Define principal and interest rate to list your request on-chain.</p>
            </div>

            <form onSubmit={handleRequestLoan} className="space-y-6">
              
              {/* Principal Selector */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Principal Amount (ETH)
                  </label>
                  <div className="flex gap-2">
                    {["0.01", "0.05", "0.1"].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setPrincipal(val)}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all ${
                          principal === val
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {val} ETH
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  step="0.001"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono font-semibold placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                />
              </div>

              {/* Interest Slider */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Interest Yield Rate: <span className="text-blue-600 font-extrabold">{interestPercent}%</span>
                  </label>
                  <span className="text-xs font-mono font-medium text-slate-500">Total Payback: {calculatedPayback} ETH</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={interestPercent}
                  onChange={(e) => setInterestPercent(Number(e.target.value))}
                  className="w-full accent-blue-600 h-2 bg-slate-100 rounded-lg cursor-pointer"
                />
              </div>

              {/* Duration Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Duration (Days)
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[7, 14, 30].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setDurationDays(days)}
                      className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                        durationDays === days
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {days} Days
                    </button>
                  ))}
                </div>
              </div>

              {/* Breakdown */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Principal requested:</span>
                  <span className="font-mono font-bold text-slate-900">{principal || "0"} ETH</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Lender Interest Premium:</span>
                  <span className="font-mono font-bold text-blue-600">+{(parseFloat(calculatedPayback) - parseFloat(principal || 0)).toFixed(4)} ETH</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900">
                  <span>Total Repayment Due:</span>
                  <span className="font-mono text-emerald-600">{calculatedPayback} ETH</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={processing}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-xs transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {processing ? "Broadcasting Tx..." : "Broadcast Loan Request"}
              </button>
            </form>
          </section>
        )}

        {/* TAB 2: BORROWER'S LOANS TABLE (Exact Table Styling) */}
        {activeTab === "my-loans" && (
          <section className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">My Active Loan Requests</h3>
                <p className="text-sm text-slate-500">Track funding, withdraw payouts, or fulfill repayments</p>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full">
                  {myLoans.length} Requests
                </span>
                <button
                  onClick={() => loadLoans(walletAddress)}
                  className="px-3.5 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition-all cursor-pointer"
                >
                  {loadingLoans ? "Syncing..." : "Refresh Feed"}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/80 text-xs text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4">Loan ID</th>
                    <th className="px-6 py-4">Principal</th>
                    <th className="px-6 py-4">Repayment</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Due Date</th>
                    <th className="px-6 py-4">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-sm">
                  {myLoans.length === 0 && !loadingLoans ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                        No loan requests available.
                      </td>
                    </tr>
                  ) : (
                    myLoans.map((loan) => (
                      <tr key={loan.id} className="hover:bg-slate-50/60 transition-all">
                        <td className="px-6 py-4 font-semibold text-slate-900">#{loan.id}</td>
                        <td className="px-6 py-4 font-semibold text-slate-900">{loan.principal} ETH</td>
                        <td className="px-6 py-4 font-semibold text-emerald-600">{loan.repayment} ETH</td>
                        <td className="px-6 py-4">{getStatusBadge(loan.status)}</td>
                        <td className="px-6 py-4 text-slate-500">{loan.dueDate}</td>
                        <td className="px-6 py-4">
                          {loan.status === STATUS.Funded && (
                            <button
                              onClick={() => openActionModal(loan, "WITHDRAW")}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-all cursor-pointer"
                            >
                              Withdraw
                            </button>
                          )}

                          {loan.status === STATUS.Withdrawn && (
                            <button
                              onClick={() => openActionModal(loan, "REPAY")}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-all cursor-pointer"
                            >
                              Repay
                            </button>
                          )}

                          {loan.status === STATUS.Requested && (
                            <span className="text-xs text-slate-400 italic">Awaiting Lender</span>
                          )}

                          {loan.status === STATUS.Repaid && (
                            <span className="text-xs text-slate-400 italic">Settled</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* ACTION MODAL (WITHDRAW / REPAY) */}
      {selectedLoan && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {actionType === "WITHDRAW" ? `Withdraw Loan #${selectedLoan.id}` : `Repay Loan #${selectedLoan.id}`}
              </h3>
              <button onClick={closeModal} disabled={processing} className="text-slate-400 hover:text-slate-600 text-2xl font-bold cursor-pointer">
                ×
              </button>
            </div>

            <div className="space-y-2.5 bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Principal Amount:</span>
                <span className="font-mono font-semibold text-slate-900">{selectedLoan.principal} ETH</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Obligation Repayment:</span>
                <span className="font-mono font-semibold text-emerald-600">{selectedLoan.repayment} ETH</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Due Date:</span>
                <span className="font-medium text-slate-800">{selectedLoan.dueDate}</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              {actionType === "WITHDRAW"
                ? "This transaction will release the funded principal from the smart contract directly into your connected wallet."
                : "This transaction will send the required payback ETH to settle the debt obligation on-chain."}
            </p>

            <div className="flex gap-3">
              <button
                onClick={closeModal}
                disabled={processing}
                className="w-1/2 py-2.5 border border-slate-200 font-semibold text-sm rounded-lg hover:bg-slate-50 transition-all text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={actionType === "WITHDRAW" ? executeWithdraw : executeRepay}
                disabled={processing}
                className={`w-1/2 py-2.5 font-semibold text-sm rounded-lg transition-all text-white cursor-pointer ${
                  actionType === "WITHDRAW"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {processing ? "Processing..." : actionType === "WITHDRAW" ? "Confirm Withdrawal" : "Submit Repayment"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}