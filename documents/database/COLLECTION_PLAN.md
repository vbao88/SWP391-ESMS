# MongoDB Collection Plan

## Core collections

1. users
2. customerProfiles
3. familyProfiles
4. addresses
5. branches
6. staffSchedules
7. brands
8. categories
9. frames
10. frameVariants
11. lenses
12. lensOptions
13. branchInventories
14. inventoryReservations
15. inventoryTransactions
16. carts
17. prescriptions
18. prescriptionVersions
19. prescriptionAssignments
20. orders
21. payments
22. orderStatusHistories
23. cancellationRequests
24. auditLogs

## Planned collections

25. appointments
26. appointmentAssignments
27. shipments
28. returnRequests
29. refunds
30. promotions
31. promotionUsages
32. reviews
33. conversations
34. messages
35. notifications
36. crossBranchSupportRequests

The final model design should embed small immutable snapshots where useful and use references for independently managed aggregates.
