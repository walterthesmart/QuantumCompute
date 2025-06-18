import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("Quantum Compute Marketplace", () => {
  beforeEach(() => {
    // Reset simnet state before each test
  });

  describe("Resource Management", () => {
    it("should allow providers to list quantum computing resources", () => {
      const { result } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "list-resource",
        [
          Cl.stringAscii("IBM Quantum System One"),
          Cl.stringAscii("127-qubit quantum processor with advanced error correction"),
          Cl.uint(127),
          Cl.uint(1000000) // 1 STX per hour in microSTX
        ],
        wallet1
      );

      expect(result).toBeOk(Cl.uint(1));
    });

    it("should reject invalid resource listings", () => {
      // Test empty name
      const { result: emptyName } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "list-resource",
        [
          Cl.stringAscii(""),
          Cl.stringAscii("Description"),
          Cl.uint(50),
          Cl.uint(1000000)
        ],
        wallet1
      );

      expect(emptyName).toBeErr(Cl.uint(105)); // err-invalid-input

      // Test zero qubits
      const { result: zeroQubits } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "list-resource",
        [
          Cl.stringAscii("Test System"),
          Cl.stringAscii("Description"),
          Cl.uint(0),
          Cl.uint(1000000)
        ],
        wallet1
      );

      expect(zeroQubits).toBeErr(Cl.uint(105)); // err-invalid-input

      // Test zero price
      const { result: zeroPrice } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "list-resource",
        [
          Cl.stringAscii("Test System"),
          Cl.stringAscii("Description"),
          Cl.uint(50),
          Cl.uint(0)
        ],
        wallet1
      );

      expect(zeroPrice).toBeErr(Cl.uint(105)); // err-invalid-input
    });

    it("should allow providers to update resource availability", () => {
      // First list a resource
      simnet.callPublicFn(
        "quantum-compute-marketplace",
        "list-resource",
        [
          Cl.stringAscii("Test System"),
          Cl.stringAscii("Test quantum computer"),
          Cl.uint(50),
          Cl.uint(500000)
        ],
        wallet1
      );

      // Update availability
      const { result } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "update-resource-availability",
        [Cl.uint(1), Cl.bool(false)],
        wallet1
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("should reject availability updates from non-providers", () => {
      // List resource as wallet1
      simnet.callPublicFn(
        "quantum-compute-marketplace",
        "list-resource",
        [
          Cl.stringAscii("Test System"),
          Cl.stringAscii("Test quantum computer"),
          Cl.uint(50),
          Cl.uint(500000)
        ],
        wallet1
      );

      // Try to update as wallet2
      const { result } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "update-resource-availability",
        [Cl.uint(1), Cl.bool(false)],
        wallet2
      );

      expect(result).toBeErr(Cl.uint(100)); // err-owner-only
    });
  });

  describe("Balance Management", () => {
    it("should allow users to deposit STX tokens", () => {
      const depositAmount = 5000000; // 5 STX in microSTX

      const { result } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "deposit",
        [Cl.uint(depositAmount)],
        wallet1
      );

      expect(result).toBeOk(Cl.bool(true));

      // Check balance
      const { result: balance } = simnet.callReadOnlyFn(
        "quantum-compute-marketplace",
        "get-balance",
        [Cl.principal(wallet1)],
        wallet1
      );

      expect(balance).toBeUint(depositAmount);
    });

    it("should allow users to withdraw STX tokens", () => {
      const depositAmount = 5000000;
      const withdrawAmount = 2000000;

      // First deposit
      simnet.callPublicFn(
        "quantum-compute-marketplace",
        "deposit",
        [Cl.uint(depositAmount)],
        wallet1
      );

      // Then withdraw
      const { result } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "withdraw",
        [Cl.uint(withdrawAmount)],
        wallet1
      );

      expect(result).toBeOk(Cl.bool(true));

      // Check remaining balance
      const { result: balance } = simnet.callReadOnlyFn(
        "quantum-compute-marketplace",
        "get-balance",
        [Cl.principal(wallet1)],
        wallet1
      );

      expect(balance).toBeUint(depositAmount - withdrawAmount);
    });

    it("should reject withdrawals exceeding balance", () => {
      const depositAmount = 1000000;
      const withdrawAmount = 2000000;

      // Deposit less than withdrawal amount
      simnet.callPublicFn(
        "quantum-compute-marketplace",
        "deposit",
        [Cl.uint(depositAmount)],
        wallet1
      );

      // Try to withdraw more
      const { result } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "withdraw",
        [Cl.uint(withdrawAmount)],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(103)); // err-insufficient-balance
    });
  });

  describe("Booking System", () => {
    beforeEach(() => {
      // Set up a resource and user balance for booking tests
      simnet.callPublicFn(
        "quantum-compute-marketplace",
        "list-resource",
        [
          Cl.stringAscii("Test Quantum Computer"),
          Cl.stringAscii("50-qubit quantum processor for testing"),
          Cl.uint(50),
          Cl.uint(1000000) // 1 STX per hour
        ],
        wallet1
      );

      simnet.callPublicFn(
        "quantum-compute-marketplace",
        "deposit",
        [Cl.uint(10000000)], // 10 STX
        wallet2
      );
    });

    it("should allow users to book available resources", () => {
      const duration = 2; // 2 hours

      const { result } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "book-resource",
        [Cl.uint(1), Cl.uint(duration)],
        wallet2
      );

      expect(result).toBeOk(Cl.uint(1)); // booking ID

      // Check that user balance was deducted
      const { result: userBalance } = simnet.callReadOnlyFn(
        "quantum-compute-marketplace",
        "get-balance",
        [Cl.principal(wallet2)],
        wallet2
      );

      expect(userBalance).toBeUint(8000000); // 10 STX - 2 STX (2 hours * 1 STX/hour)

      // Check that provider balance was credited
      const { result: providerBalance } = simnet.callReadOnlyFn(
        "quantum-compute-marketplace",
        "get-balance",
        [Cl.principal(wallet1)],
        wallet1
      );

      expect(providerBalance).toBeUint(2000000); // 2 STX
    });

    it("should reject bookings with insufficient funds", () => {
      // Try to book for 20 hours (20 STX) with only 10 STX balance
      const { result } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "book-resource",
        [Cl.uint(1), Cl.uint(20)],
        wallet2
      );

      expect(result).toBeErr(Cl.uint(104)); // err-insufficient-funds
    });

    it("should reject bookings for non-existent resources", () => {
      const { result } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "book-resource",
        [Cl.uint(999), Cl.uint(1)],
        wallet2
      );

      expect(result).toBeErr(Cl.uint(101)); // err-resource-not-found
    });
  });

  describe("Job Management", () => {
    beforeEach(() => {
      // Set up resource, balance, and booking
      simnet.callPublicFn(
        "quantum-compute-marketplace",
        "list-resource",
        [
          Cl.stringAscii("Test System"),
          Cl.stringAscii("Test quantum computer"),
          Cl.uint(50),
          Cl.uint(1000000)
        ],
        wallet1
      );

      simnet.callPublicFn(
        "quantum-compute-marketplace",
        "deposit",
        [Cl.uint(5000000)],
        wallet2
      );

      simnet.callPublicFn(
        "quantum-compute-marketplace",
        "book-resource",
        [Cl.uint(1), Cl.uint(2)],
        wallet2
      );
    });

    it("should allow users to queue jobs", () => {
      const { result } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "queue-job",
        [Cl.uint(1), Cl.uint(1)], // resource-id, booking-id
        wallet2
      );

      expect(result).toBeOk(Cl.uint(1)); // job ID
    });

    it("should allow providers to update job status", () => {
      // Queue a job first
      simnet.callPublicFn(
        "quantum-compute-marketplace",
        "queue-job",
        [Cl.uint(1), Cl.uint(1)],
        wallet2
      );

      // Provider updates job status
      const { result } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "update-job-status",
        [Cl.uint(1), Cl.stringAscii("running")],
        wallet1
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("should reject job status updates from non-providers", () => {
      // Queue a job
      simnet.callPublicFn(
        "quantum-compute-marketplace",
        "queue-job",
        [Cl.uint(1), Cl.uint(1)],
        wallet2
      );

      // Non-provider tries to update status
      const { result } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "update-job-status",
        [Cl.uint(1), Cl.stringAscii("running")],
        wallet3
      );

      expect(result).toBeErr(Cl.uint(100)); // err-owner-only
    });
  });

  describe("Read-only Functions", () => {
    it("should return resource details", () => {
      simnet.callPublicFn(
        "quantum-compute-marketplace",
        "list-resource",
        [
          Cl.stringAscii("Test System"),
          Cl.stringAscii("Description"),
          Cl.uint(50),
          Cl.uint(1000000)
        ],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        "quantum-compute-marketplace",
        "get-resource-details",
        [Cl.uint(1)],
        wallet1
      );

      expect(result).toBeSome(
        Cl.tuple({
          provider: Cl.principal(wallet1),
          name: Cl.stringAscii("Test System"),
          description: Cl.stringAscii("Description"),
          qubits: Cl.uint(50),
          "base-price": Cl.uint(1000000),
          availability: Cl.bool(true),
          "total-bookings": Cl.uint(0),
          "created-at": Cl.uint(2)
        })
      );
    });

    it("should return current price with demand factor", () => {
      simnet.callPublicFn(
        "quantum-compute-marketplace",
        "list-resource",
        [
          Cl.stringAscii("Test System"),
          Cl.stringAscii("Description"),
          Cl.uint(50),
          Cl.uint(1000000)
        ],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        "quantum-compute-marketplace",
        "get-current-price",
        [Cl.uint(1)],
        wallet1
      );

      expect(result).toBeOk(Cl.uint(1000000)); // Base price with 100% demand factor
    });
  });

  describe("Admin Functions", () => {
    it("should allow contract owner to update demand factor", () => {
      const { result } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "update-demand-factor",
        [Cl.uint(150)], // 1.5x demand factor
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("should reject demand factor updates from non-owners", () => {
      const { result } = simnet.callPublicFn(
        "quantum-compute-marketplace",
        "update-demand-factor",
        [Cl.uint(150)],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(100)); // err-owner-only
    });
  });
});
