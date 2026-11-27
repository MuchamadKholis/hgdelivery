# Admin and courier management test plan

Run only in a disposable test environment with non-production accounts and orders.

## Admin user management
1. Sign in as an active ADMIN.
2. Open Pengguna and create one CUSTOMER and one COURIER with unique emails and passwords of at least 12 characters.
3. Confirm both accounts appear with the correct roles.
4. Attempt to create a duplicate email; expect a conflict response.
5. Deactivate the test customer; confirm it cannot sign in.
6. Reactivate the customer and confirm sign-in works.
7. Confirm a non-admin cannot read or create users.
8. Confirm the currently signed-in admin cannot deactivate their own account, and the last active admin cannot be deactivated.

## Courier assignment
1. Create a test order as a customer.
2. Sign in as ADMIN and assign an active COURIER.
3. Confirm the order appears in that courier's order list.
4. Confirm a customer or courier cannot assign a courier.
5. Confirm an inactive or CUSTOMER account cannot be assigned.
6. Confirm the assignment creates an order event and an audit log entry.

## Important
- Syntax checks do not replace these runtime tests.
- Do not use real customer data, real delivery addresses, or real proof photos during validation.
- Verify all role boundaries and error cases before using the feature operationally.
