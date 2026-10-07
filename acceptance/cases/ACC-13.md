# ACC-13

Status: PASS

Purpose: Swift/Xcode

Expected Result: SPM → swift test; Xcode senza config → SKIP legittimo; con config → RUN

Evidence: disposable repository CI runs 31405030012 (SwiftPM test PASS),
31405763029 (Xcode without configuration SKIP), and 31409386680 (configured
Xcode test PASS after the Bash 3.2 fix).
