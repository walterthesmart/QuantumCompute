;; Quantum Compute Network (QCN) - Decentralized Marketplace for Quantum Computing Resources
;; Built on Stacks blockchain using Clarity smart contracts

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-resource-not-found (err u101))
(define-constant err-resource-already-listed (err u102))
(define-constant err-insufficient-balance (err u103))
(define-constant err-insufficient-funds (err u104))
(define-constant err-invalid-input (err u105))

;; Data Variables
(define-data-var demand-factor uint u100) ;; Base demand factor (100 = 1.0x)
(define-data-var next-resource-id uint u1)
(define-data-var next-booking-id uint u1)
(define-data-var next-job-id uint u1)

;; Data Maps
(define-map resources
  { resource-id: uint }
  {
    provider: principal,
    name: (string-ascii 64),
    description: (string-ascii 256),
    qubits: uint,
    base-price: uint, ;; Price per hour in microSTX
    availability: bool,
    total-bookings: uint,
    created-at: uint
  }
)

(define-map user-balances
  { user: principal }
  { balance: uint }
)

(define-map bookings
  { booking-id: uint }
  {
    user: principal,
    resource-id: uint,
    duration: uint, ;; Duration in hours
    total-cost: uint,
    status: (string-ascii 20), ;; "pending", "active", "completed", "cancelled"
    created-at: uint
  }
)

(define-map jobs
  { job-id: uint }
  {
    user: principal,
    resource-id: uint,
    booking-id: uint,
    status: (string-ascii 20), ;; "queued", "running", "completed", "failed"
    submitted-at: uint,
    completed-at: (optional uint)
  }
)

;; Private Functions
(define-private (calculate-dynamic-price (base-price uint))
  (/ (* base-price (var-get demand-factor)) u100)
)

;; Public Functions

;; Resource Management
(define-public (list-resource (name (string-ascii 64)) (description (string-ascii 256)) (qubits uint) (base-price uint))
  (let
    (
      (resource-id (var-get next-resource-id))
    )
    (asserts! (> (len name) u0) err-invalid-input)
    (asserts! (> qubits u0) err-invalid-input)
    (asserts! (> base-price u0) err-invalid-input)
    
    (map-set resources
      { resource-id: resource-id }
      {
        provider: tx-sender,
        name: name,
        description: description,
        qubits: qubits,
        base-price: base-price,
        availability: true,
        total-bookings: u0,
        created-at: block-height
      }
    )
    
    (var-set next-resource-id (+ resource-id u1))
    (ok resource-id)
  )
)

(define-public (update-resource-availability (resource-id uint) (available bool))
  (let
    (
      (resource (unwrap! (map-get? resources { resource-id: resource-id }) err-resource-not-found))
    )
    (asserts! (is-eq (get provider resource) tx-sender) err-owner-only)
    
    (map-set resources
      { resource-id: resource-id }
      (merge resource { availability: available })
    )
    (ok true)
  )
)

;; Balance Management
(define-public (deposit (amount uint))
  (let
    (
      (current-balance (default-to u0 (get balance (map-get? user-balances { user: tx-sender }))))
    )
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (map-set user-balances
      { user: tx-sender }
      { balance: (+ current-balance amount) }
    )
    (ok true)
  )
)

(define-public (withdraw (amount uint))
  (let
    (
      (current-balance (default-to u0 (get balance (map-get? user-balances { user: tx-sender }))))
      (recipient tx-sender)
    )
    (asserts! (>= current-balance amount) err-insufficient-balance)

    (try! (as-contract (stx-transfer? amount tx-sender recipient)))
    (map-set user-balances
      { user: recipient }
      { balance: (- current-balance amount) }
    )
    (ok true)
  )
)

;; Booking System
(define-public (book-resource (resource-id uint) (duration uint))
  (let
    (
      (resource (unwrap! (map-get? resources { resource-id: resource-id }) err-resource-not-found))
      (current-price (calculate-dynamic-price (get base-price resource)))
      (total-cost (* current-price duration))
      (user-balance (default-to u0 (get balance (map-get? user-balances { user: tx-sender }))))
      (booking-id (var-get next-booking-id))
    )
    (asserts! (get availability resource) err-resource-not-found)
    (asserts! (> duration u0) err-invalid-input)
    (asserts! (>= user-balance total-cost) err-insufficient-funds)
    
    ;; Deduct cost from user balance
    (map-set user-balances
      { user: tx-sender }
      { balance: (- user-balance total-cost) }
    )
    
    ;; Add to provider balance
    (let
      (
        (provider-balance (default-to u0 (get balance (map-get? user-balances { user: (get provider resource) }))))
      )
      (map-set user-balances
        { user: (get provider resource) }
        { balance: (+ provider-balance total-cost) }
      )
    )
    
    ;; Create booking record
    (map-set bookings
      { booking-id: booking-id }
      {
        user: tx-sender,
        resource-id: resource-id,
        duration: duration,
        total-cost: total-cost,
        status: "active",
        created-at: block-height
      }
    )
    
    ;; Update resource booking count
    (map-set resources
      { resource-id: resource-id }
      (merge resource { total-bookings: (+ (get total-bookings resource) u1) })
    )
    
    (var-set next-booking-id (+ booking-id u1))
    (ok booking-id)
  )
)

;; Job Management
(define-public (queue-job (resource-id uint) (booking-id uint))
  (let
    (
      (booking (unwrap! (map-get? bookings { booking-id: booking-id }) err-resource-not-found))
      (job-id (var-get next-job-id))
    )
    (asserts! (is-eq (get user booking) tx-sender) err-owner-only)
    (asserts! (is-eq (get resource-id booking) resource-id) err-invalid-input)
    
    (map-set jobs
      { job-id: job-id }
      {
        user: tx-sender,
        resource-id: resource-id,
        booking-id: booking-id,
        status: "queued",
        submitted-at: block-height,
        completed-at: none
      }
    )
    
    (var-set next-job-id (+ job-id u1))
    (ok job-id)
  )
)

(define-public (update-job-status (job-id uint) (new-status (string-ascii 20)))
  (let
    (
      (job (unwrap! (map-get? jobs { job-id: job-id }) err-resource-not-found))
      (resource (unwrap! (map-get? resources { resource-id: (get resource-id job) }) err-resource-not-found))
    )
    (asserts! (is-eq (get provider resource) tx-sender) err-owner-only)
    
    (map-set jobs
      { job-id: job-id }
      (merge job { 
        status: new-status,
        completed-at: (if (or (is-eq new-status "completed") (is-eq new-status "failed"))
                         (some block-height)
                         none)
      })
    )
    (ok true)
  )
)

;; Admin Functions
(define-public (update-demand-factor (new-factor uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (var-set demand-factor new-factor)
    (ok true)
  )
)

;; Read-only Functions
(define-read-only (get-resource-details (resource-id uint))
  (map-get? resources { resource-id: resource-id })
)

(define-read-only (get-balance (user principal))
  (default-to u0 (get balance (map-get? user-balances { user: user })))
)

(define-read-only (get-current-price (resource-id uint))
  (match (map-get? resources { resource-id: resource-id })
    resource (ok (calculate-dynamic-price (get base-price resource)))
    err-resource-not-found
  )
)

(define-read-only (get-job-status (job-id uint))
  (map-get? jobs { job-id: job-id })
)

(define-read-only (get-booking-details (booking-id uint))
  (map-get? bookings { booking-id: booking-id })
)

(define-read-only (get-total-market-value)
  (var-get demand-factor) ;; Simplified - in real implementation would calculate total value
)

(define-read-only (get-demand-factor)
  (var-get demand-factor)
)
