# Technical strategy

Niche: reproducible educational ED/inpatient capacity experiments with a discrete-event model and paired Monte Carlo comparisons. Target users are students and analysts learning simulation experiments. This is not a calibrated digital twin.

Alternatives: [SimPy](https://simpy.readthedocs.io/en/stable/) supplies DES primitives; [FlexSim Healthcare](https://docs.flexsim.com/en/21.2/FlexSimHC/WelcomeFlexSimHC/WelcomeFlexSimHC.html) and AnyLogic document broader patient-flow/capacity models; [Synthea](https://synthetichealth.github.io/synthea/) generates synthetic patient records; [MIMIC-IV-ED](https://physionet.org/content/mimic-iv-ed/1.0/) provides real de-identified ED observations but requires PhysioNet credentialing, training, and a data-use agreement. A large proprietary simulator or real-data calibration is not feasible or appropriate for this standalone MVP.

| Direction | CS | Domain | Useful | Distinct | Feasible | Verifiable | Accessible | Interview | Total / 40 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Matched DES intervention experiment **selected** | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 39 |
| Calibrate from MIMIC-IV-ED | 4 | 5 | 4 | 4 | 2 | 2 | 2 | 5 | 28 |
| Staffing/shift optimization | 5 | 4 | 4 | 3 | 2 | 4 | 5 | 4 | 31 |

Technical proof: event-queue/resource semantics, patient accounting invariants, deterministic seeds, paired Student-t interval, and a comparison of paired estimator variance with the independent-marginal estimate. The variance diagnostic can be negative; do not promise common-random-number benefit for every scenario.

Scope: no PHI, clinical routing or staffing recommendations, facility calibration, or care claims. Synthetic scenarios support reproducibility but cannot establish real-world validity. A validated model needs operational data and domain review. Simulation validation concepts: [Sargent, verification and validation of simulation models](https://doi.org/10.1057/jos.2012.20).
