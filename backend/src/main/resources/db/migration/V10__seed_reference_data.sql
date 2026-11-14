-- Clinics (read-only reference data)
INSERT INTO clinics (id, name, address, time_zone) VALUES
    ('a1b2c3d4-0000-4000-8000-000000000001', 'CareSync Banjara Hills', 'Road No. 12, Banjara Hills, Hyderabad', 'Asia/Kolkata'),
    ('a1b2c3d4-0000-4000-8000-000000000002', 'CareSync Jubilee Hills', 'Plot 45, Jubilee Hills, Hyderabad', 'Asia/Kolkata'),
    ('a1b2c3d4-0000-4000-8000-000000000003', 'CareSync Indiranagar', '100 Feet Road, Indiranagar, Bengaluru', 'Asia/Kolkata');

-- Specializations (read-only reference data)
INSERT INTO specializations (id, name) VALUES
    ('b1000000-0000-4000-8000-000000000001', 'Cardiology'),
    ('b1000000-0000-4000-8000-000000000002', 'Dermatology'),
    ('b1000000-0000-4000-8000-000000000003', 'ENT'),
    ('b1000000-0000-4000-8000-000000000004', 'General Medicine'),
    ('b1000000-0000-4000-8000-000000000005', 'Gynecology'),
    ('b1000000-0000-4000-8000-000000000006', 'Neurology'),
    ('b1000000-0000-4000-8000-000000000007', 'Orthopedics'),
    ('b1000000-0000-4000-8000-000000000008', 'Pediatrics');

-- Initial departments (Admin may add or update via API)
INSERT INTO departments (id, name, description) VALUES
    ('c1000000-0000-4000-8000-000000000001', 'Cardiology', 'Heart and vascular care'),
    ('c1000000-0000-4000-8000-000000000002', 'General Medicine', 'Primary and internal medicine'),
    ('c1000000-0000-4000-8000-000000000003', 'Orthopedics', 'Bone, joint and musculoskeletal care'),
    ('c1000000-0000-4000-8000-000000000004', 'Pediatrics', 'Child and adolescent healthcare');

-- Medicines (read-only catalog)
INSERT INTO medicines (id, name, generic_name, strength, form, drug_class) VALUES
    ('10000000-0000-4000-8000-000000000001', 'Augmentin 625', 'Amoxicillin + Clavulanic acid', '500 mg + 125 mg', 'TABLET', 'Penicillin'),
    ('10000000-0000-4000-8000-000000000002', 'Dolo 650', 'Paracetamol', '650 mg', 'TABLET', 'Analgesic'),
    ('10000000-0000-4000-8000-000000000003', 'Brufen 400', 'Ibuprofen', '400 mg', 'TABLET', 'NSAID'),
    ('10000000-0000-4000-8000-000000000004', 'Ecosprin 75', 'Aspirin', '75 mg', 'TABLET', 'Salicylate'),
    ('10000000-0000-4000-8000-000000000005', 'Warf 5', 'Warfarin', '5 mg', 'TABLET', 'Anticoagulant'),
    ('10000000-0000-4000-8000-000000000006', 'Azithral 500', 'Azithromycin', '500 mg', 'TABLET', 'Macrolide'),
    ('10000000-0000-4000-8000-000000000007', 'Cetzine 10', 'Cetirizine', '10 mg', 'TABLET', 'Antihistamine'),
    ('10000000-0000-4000-8000-000000000008', 'Atorva 20', 'Atorvastatin', '20 mg', 'TABLET', 'Statin'),
    ('10000000-0000-4000-8000-000000000009', 'Clopilet 75', 'Clopidogrel', '75 mg', 'TABLET', 'Antiplatelet'),
    ('10000000-0000-4000-8000-000000000010', 'Pan 40', 'Pantoprazole', '40 mg', 'TABLET', 'Proton Pump Inhibitor'),
    ('10000000-0000-4000-8000-000000000011', 'Omez 20', 'Omeprazole', '20 mg', 'CAPSULE', 'Proton Pump Inhibitor'),
    ('10000000-0000-4000-8000-000000000012', 'Glycomet 500', 'Metformin', '500 mg', 'TABLET', 'Biguanide'),
    ('10000000-0000-4000-8000-000000000013', 'Asthalin Inhaler', 'Salbutamol', '100 mcg', 'INHALER', 'Beta-2 Agonist'),
    ('10000000-0000-4000-8000-000000000014', 'Ciplox 500', 'Ciprofloxacin', '500 mg', 'TABLET', 'Fluoroquinolone'),
    ('10000000-0000-4000-8000-000000000015', 'Flagyl 400', 'Metronidazole', '400 mg', 'TABLET', 'Nitroimidazole'),
    ('10000000-0000-4000-8000-000000000016', 'Amoxil 500', 'Amoxicillin', '500 mg', 'CAPSULE', 'Penicillin'),
    ('10000000-0000-4000-8000-000000000017', 'Calpol Syrup', 'Paracetamol', '250 mg/5 ml', 'SYRUP', 'Analgesic'),
    ('10000000-0000-4000-8000-000000000018', 'Tetanus Toxoid', 'Tetanus Toxoid', '0.5 ml', 'INJECTION', 'Vaccine'),
    ('10000000-0000-4000-8000-000000000019', 'Betnovate Cream', 'Betamethasone', '0.1%', 'CREAM', 'Corticosteroid'),
    ('10000000-0000-4000-8000-000000000020', 'Ciplox Eye Drops', 'Ciprofloxacin', '0.3%', 'DROPS', 'Fluoroquinolone');

-- Drug interactions (medicine_a_id < medicine_b_id enforced)
INSERT INTO drug_interactions (id, medicine_a_id, medicine_b_id, severity, message) VALUES
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005', 'SEVERE', 'Ibuprofen + Warfarin significantly increases risk of severe gastrointestinal bleeding.'),
    ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005', 'SEVERE', 'Aspirin + Warfarin markedly increases major hemorrhage risk.'),
    ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'MODERATE', 'NSAIDs may reduce cardioprotective antiplatelet effect of low-dose Aspirin and increase GI irritation.'),
    ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000011', 'MODERATE', 'Omeprazole may reduce CYP2C19 activation and efficacy of Clopidogrel.'),
    ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000014', 'SEVERE', 'Ciprofloxacin enhances anticoagulant effect of Warfarin and increases bleeding risk.'),
    ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000015', 'SEVERE', 'Metronidazole inhibits Warfarin metabolism and causes elevated INR and bleeding risk.'),
    ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000008', 'MILD', 'Azithromycin may slightly increase Atorvastatin exposure; monitor for muscle symptoms.'),
    ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000017', 'MODERATE', 'Duplicate Paracetamol active ingredient across tablets and syrup; risk of overdose.');
