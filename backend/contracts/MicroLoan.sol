// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MicroLoan {
    enum Status { Requested, Funded, Withdrawn, Repaid, Defaulted }

    struct Loan {
        address payable borrower;
        address payable lender;
        uint256 principal;
        uint256 repayment;
        uint256 dueDate;
        Status status;
    }

    uint256 public loanCounter;
    mapping(uint256 => Loan) public loans;

    address public admin;
    bool public paused;
    uint256 public maxLoanAmount;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Caller is not the admin");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is currently paused by admin");
        _;
    }

    event Requested(uint256 indexed loanId, address indexed borrower, uint256 principal);
    event Funded(uint256 indexed loanId, address indexed lender, uint256 principal);
    event Withdrawn(uint256 indexed loanId, address indexed borrower, uint256 principal);
    event Repaid(uint256 indexed loanId, address indexed borrower, uint256 repayment);
    event Defaulted(uint256 indexed loanId, address indexed borrower);
    event PausedStateChanged(bool isPaused);
    event MaxLoanLimitUpdated(uint256 newLimit);

    constructor() {
        admin = msg.sender;
        maxLoanAmount = 5 ether; 
    }

    function togglePause() external onlyAdmin {
        paused = !paused;
        emit PausedStateChanged(paused);
    }

    function setMaxLoanAmount(uint256 _newLimit) external onlyAdmin {
        maxLoanAmount = _newLimit;
        emit MaxLoanLimitUpdated(_newLimit);
    }

    function requestLoan(uint256 _principal, uint256 _repayment, uint256 _duration) external whenNotPaused {
        require(_principal <= maxLoanAmount, "Requested amount exceeds admin maximum limit");
        
        loanCounter++;
        
        loans[loanCounter] = Loan({
            borrower: payable(msg.sender),
            lender: payable(address(0)),
            principal: _principal,
            repayment: _repayment,
            dueDate: block.timestamp + _duration,
            status: Status.Requested
        });

        emit Requested(loanCounter, msg.sender, _principal);
    }

    function fund(uint256 _loanId) external payable whenNotPaused {
        Loan storage loan = loans[_loanId];
        
        require(loan.status == Status.Requested, "Loan not in Requested state");
        require(msg.value == loan.principal, "Must fund the exact principal amount");
        require(msg.sender != loan.borrower, "Borrower cannot fund their own loan");

        loan.lender = payable(msg.sender);
        loan.status = Status.Funded;
        
        emit Funded(_loanId, msg.sender, msg.value);
    }

    function withdrawToBorrower(uint256 _loanId) external whenNotPaused {
        Loan storage loan = loans[_loanId];
        
        require(loan.status == Status.Funded, "Loan is not funded");
        require(msg.sender == loan.borrower, "Only borrower can withdraw");

        loan.status = Status.Withdrawn;
        
        (bool success, ) = loan.borrower.call{value: loan.principal}("");
        require(success, "Withdrawal transfer failed");

        emit Withdrawn(_loanId, msg.sender, loan.principal);
    }

    function repay(uint256 _loanId) external payable whenNotPaused {
        Loan storage loan = loans[_loanId];
        
        require(loan.status == Status.Withdrawn, "Loan not active");
        require(msg.value == loan.repayment, "Must pay exact repayment amount");
        require(block.timestamp <= loan.dueDate, "Loan is past due date");

        loan.status = Status.Repaid;

        (bool success, ) = loan.lender.call{value: msg.value}("");
        require(success, "Repayment transfer failed");

        emit Repaid(_loanId, loan.borrower, msg.value);
    }

    function markDefault(uint256 _loanId) external whenNotPaused {
        Loan storage loan = loans[_loanId];
        
        require(loan.status == Status.Withdrawn, "Loan not active");
        require(block.timestamp > loan.dueDate, "Loan is not yet past due");

        loan.status = Status.Defaulted;

        emit Defaulted(_loanId, loan.borrower);
    }
}