import { environment, fail } from './env.mjs';

const firstNames = ['Miguel','Sofia','Gabriel','Isabella','Lucas','Mia','Nathan','Chloe','Ethan','Zoe','Daniel','Ava','Liam','Ella','Jacob','Faith','Noah','Julia','Caleb','Nina','Adrian','Leah','Marco','Bianca'];
const lastNames = ['Alvarez','Bautista','Castillo','Domingo','Evangelista','Flores','Garcia','Herrera','Ignacio','Javier','Lim','Mendoza','Navarro','Ocampo','Pascual','Quiambao','Ramos','Santos','Torres','Valdez','Villanueva','Yap','Zamora','Dela Cruz'];
const sections = ['Mapagkalinga','Masipag','Malikhain','Matapat'];
const complaints = ['Headache','Fever','Cough','Stomachache','Minor injury','Dizziness','Allergic symptoms','Menstrual cramps','Sore throat','Nausea'];
const diagnoses = ['Tension-type headache','Viral syndrome','Acute cough','Functional abdominal discomfort','Superficial abrasion','Mild dehydration','Allergic rhinitis','Primary dysmenorrhea','Acute pharyngitis','Transient nausea'];
const treatments = ['Rest and oral hydration','Tepid sponge bath and monitoring','Warm fluids and observation','Rest and dietary advice','Wound cleaning and sterile dressing','Oral rehydration and rest','Avoid allergen and observe','Warm compress and rest','Warm saline gargle','Rest and small frequent fluids'];
const now = new Date();
const isoDate = date => date.toISOString().slice(0,10);
const daysAgo = days => { const d=new Date(now); d.setDate(d.getDate()-days); return isoDate(d); };
const daysFromNow = days => { const d=new Date(now); d.setDate(d.getDate()+days); return isoDate(d); };

async function removeDemoData(client) {
  console.log('DEMO_RESET=true: removing existing clinical demo rows...');
  for (const table of ['notifications','activity_logs','medicine_issuance_items','medicine_issuances','vital_signs','consultations','visits','immunizations','patient_medical_history','student_guardians','guardians','students','medicines']) {
    const { error } = await client.from(table).delete().not('id','is',null);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function main() {
  const { client } = environment();
  const { count: existing, error: countError } = await client.from('students').select('*',{count:'exact',head:true}).like('student_id','DEMO-%');
  if (countError) throw countError;
  if (existing && process.env.DEMO_RESET !== 'true') {
    console.log(`Demo students already exist (${existing}). Set DEMO_RESET=true in the root .env to rebuild demo clinical data.`);
    return;
  }
  if (process.env.DEMO_RESET === 'true') await removeDemoData(client);

  const { data: staff, error: staffError } = await client.from('staff_directory').select('*');
  if (staffError) throw new Error(`Run npm run bootstrap first: ${staffError.message}`);
  const byUsername = Object.fromEntries(staff.map(item => [item.username,item]));
  const admin = byUsername.admin;
  const nurse = byUsername['nurse.maria'];
  const clinicStaff = byUsername['clinic.paolo'];
  if (!admin || !nurse || !clinicStaff) throw new Error('Required demo accounts are missing. Run npm run bootstrap first.');

  console.log('Creating 24 fictional students...');
  const studentsPayload = firstNames.map((first_name,index) => ({
    student_id:`DEMO-STU-2026-${String(index+1).padStart(4,'0')}`,
    student_number:`2026${String(index+1).padStart(5,'0')}`,
    first_name,
    middle_name:index%3===0?'Reyes':null,
    last_name:lastNames[index],
    birth_date:`${2010 + (index%7)}-${String((index%12)+1).padStart(2,'0')}-${String((index%25)+1).padStart(2,'0')}`,
    sex:index%2===0?'Male':'Female',
    grade_level:`Grade ${7+(index%6)}`,
    section:sections[index%sections.length],
    address:`Fictional Residence ${index+1}, General Trias, Cavite`,
    contact_number:`0917000${String(index+1).padStart(4,'0')}`,
    email:`student${index+1}@example.test`,
    status:'ACTIVE',created_by:admin.id,updated_by:admin.id
  }));
  const { data: students, error: studentError } = await client.from('students').insert(studentsPayload).select('*');
  if (studentError) throw studentError;

  const guardiansPayload = students.map((student,index)=>({full_name:`${lastNames[index]}, ${index%2===0?'Elena':'Roberto'}`,relationship:index%2===0?'Mother':'Father',contact_number:`0918000${String(index+1).padStart(4,'0')}`,email:`guardian${index+1}@example.test`,address:student.address}));
  const { data: guardians, error: guardianError } = await client.from('guardians').insert(guardiansPayload).select('*');
  if (guardianError) throw guardianError;
  const { error: linkError } = await client.from('student_guardians').insert(students.map((student,index)=>({student_id:student.id,guardian_id:guardians[index].id,is_primary:true,is_emergency_contact:true})));
  if (linkError) throw linkError;

  const allergies = ['None known','Peanuts','Dust','Ibuprofen','Shellfish','None known'];
  const conditions = ['None recorded','Allergic rhinitis','Mild asthma','None recorded','G6PD deficiency','None recorded'];
  const { error: historyError } = await client.from('patient_medical_history').insert(students.map((student,index)=>({
    student_id:student.id,blood_type:['O+','A+','B+','AB+'][index%4],allergies:allergies[index%allergies.length],existing_conditions:conditions[index%conditions.length],
    current_medications:index%7===0?'As-needed inhaler per family physician':'None',medical_history:index%5===0?'Previous minor sports injury; fully recovered.':'No significant medical history reported.',
    immunization_information:'Routine school-age immunizations reported as up to date.',medical_alerts:index===4?'Known G6PD deficiency — verify medication safety.':index===1?'Peanut allergy — notify guardian for exposure.':null,
    created_by:admin.id,updated_by:admin.id
  })));
  if (historyError) throw historyError;

  const { data: categories, error: categoryError } = await client.from('medicine_categories').select('*');
  if (categoryError) throw categoryError;
  const category = name => categories.find(item=>item.name===name)?.id || categories[0].id;
  console.log('Creating 16 fictional medicine inventory items...');
  const medicineRows = [
    ['MED-0001','Paracetamol','Biogesic','Analgesic / Antipyretic','Tablet','500 mg',120,'tablets',30,240],
    ['MED-0002','Paracetamol','Tempra','Analgesic / Antipyretic','Syrup','250 mg/5 mL',18,'bottles',20,180],
    ['MED-0003','Cetirizine','Generic','Antihistamine','Tablet','10 mg',75,'tablets',20,300],
    ['MED-0004','Loratadine','Generic','Antihistamine','Tablet','10 mg',8,'tablets',15,120],
    ['MED-0005','Oral Rehydration Salts','Hydrite','Gastrointestinal','Sachet','Standard',60,'sachets',20,365],
    ['MED-0006','Antacid','Kremil-S','Gastrointestinal','Tablet','Standard',35,'tablets',15,420],
    ['MED-0007','Povidone-Iodine','Betadine','Antiseptic','Solution','10%',12,'bottles',5,600],
    ['MED-0008','Isopropyl Alcohol','Generic','Antiseptic','Solution','70%',25,'bottles',10,540],
    ['MED-0009','Salbutamol','Generic','Respiratory','Nebule','2.5 mg/2.5 mL',12,'nebules',10,150],
    ['MED-0010','Dextromethorphan','Generic','Cough and Cold','Syrup','15 mg/5 mL',10,'bottles',10,210],
    ['MED-0011','Guaifenesin','Generic','Cough and Cold','Syrup','100 mg/5 mL',14,'bottles',10,200],
    ['MED-0012','Calamine Lotion','Generic','First Aid','Lotion','Standard',9,'bottles',6,330],
    ['MED-0013','Burn Ointment','Generic','First Aid','Ointment','Standard',6,'tubes',5,270],
    ['MED-0014','Adhesive Bandage','Clinic Supply','First Aid','Strip','Standard',200,'pieces',50,720],
    ['MED-0015','Ibuprofen','Generic','Analgesic / Antipyretic','Tablet','200 mg',0,'tablets',20,250],
    ['MED-0016','Expired Test Stock','Demo Brand','Other','Tablet','100 mg',10,'tablets',5,-20]
  ].map((row,index)=>({medicine_id:row[0],generic_name:row[1],brand_name:row[2],category_id:category(row[3]),dosage_form:row[4],strength:row[5],quantity:row[6],unit:row[7],minimum_stock:row[8],expiration_date:daysFromNow(row[9]),supplier:`Fictional Medical Supplier ${1+(index%3)}`,batch_number:`BATCH-DEMO-${String(index+1).padStart(3,'0')}`,storage_location:`Cabinet ${1+(index%4)} / Shelf ${1+(index%3)}`,is_active:true,created_by:admin.id,updated_by:admin.id}));
  const { data: medicines, error: medicineError } = await client.from('medicines').insert(medicineRows).select('*');
  if (medicineError) throw medicineError;

  console.log('Creating 36 fictional clinic visits and 24 consultations...');
  const visitsPayload = Array.from({length:36},(_,index)=>({
    student_id:students[index%students.length].id,visit_date:daysAgo(index%30),visit_time:`${String(8+(index%8)).padStart(2,'0')}:${index%2?'30':'00'}:00`,
    visit_type:['Walk-in','Follow-up','Referral','Medical clearance'][index%4],reason_for_visit:complaints[index%complaints.length],complaint:complaints[index%complaints.length],
    accompanied_by:index%6===0?'Class adviser':null,priority:index===32?'Emergency':index%11===0?'Urgent':index%4===0?'Moderate':'Normal',notes:'Fictional development visit record.',
    status:index<24?'COMPLETED':index<30?'COMPLETED':'OPEN',registered_by:index%2?nurse.id:clinicStaff.id,updated_by:nurse.id
  }));
  const { data: visits, error: visitError } = await client.from('visits').insert(visitsPayload).select('*');
  if (visitError) throw visitError;

  const consultationRows = visits.slice(0,24).map((visit,index)=>({visit_id:visit.id,student_id:visit.student_id,staff_id:index%2?nurse.id:clinicStaff.id,consultation_date:visit.visit_date,consultation_time:visit.visit_time,chief_complaint:complaints[index%complaints.length],symptoms:`Reported ${complaints[index%complaints.length].toLowerCase()} beginning earlier that day.`,general_appearance:'Alert, coherent, and ambulatory.',heent:index%3===0?'Mild throat erythema; otherwise unremarkable.':'No significant finding.',respiratory:'Equal chest expansion; no respiratory distress.',cardiovascular:'Regular rate and rhythm.',abdomen:index%4===0?'Soft with mild non-localized discomfort; no guarding.':'Soft and non-tender.',musculoskeletal:index%5===0?'Minor localized tenderness; full range of motion.':'No significant finding.',skin:index%5===0?'Small superficial abrasion; cleaned.':'Warm and dry.',neurological:'Oriented, no focal deficit observed.',diagnosis:diagnoses[index%diagnoses.length],findings:'Stable for school clinic management with monitoring instructions.',severity:index%9===0?'Moderate':'Mild',treatment_provided:treatments[index%treatments.length],medicine_plan:index%3===0?'Paracetamol if appropriate per clinic protocol':null,dosage:index%3===0?'Single age-appropriate dose':null,frequency:null,duration:null,recommendations:index%4===0?['Rest','Parent notification','Follow-up']:['Rest','Return to class'],medical_notes:'Fictional consultation created for development and testing only.',status:'COMPLETED',updated_by:nurse.id}));
  const { data: consultations, error: consultationError } = await client.from('consultations').insert(consultationRows).select('*');
  if (consultationError) throw consultationError;
  const { error: vitalsError } = await client.from('vital_signs').insert(consultations.map((consultation,index)=>({consultation_id:consultation.id,temperature:Number((36.4+(index%5)*0.2).toFixed(1)),systolic_bp:105+(index%6)*3,diastolic_bp:65+(index%5)*2,heart_rate:72+(index%8)*3,respiratory_rate:16+(index%4),oxygen_saturation:97+(index%3),weight:38+(index%12)*2.1,height:145+(index%10)*2.2})));
  if (vitalsError) throw vitalsError;

  console.log('Creating medicine issuance history...');
  for (let index=0;index<12;index++) {
    const medicine=medicines[index%14];const quantity=1+(index%3);const visit=visits[index];
    const { data: issuance, error: issuanceError } = await client.from('medicine_issuances').insert({student_id:visit.student_id,visit_id:visit.id,issued_by:index%2?nurse.id:clinicStaff.id,issued_at:`${visit.visit_date}T${visit.visit_time}Z`,instructions:'Use only as instructed by authorized clinic staff.',notes:'Fictional development issuance.',status:'COMPLETED'}).select('*').single();
    if (issuanceError) throw issuanceError;
    const { error: itemError } = await client.from('medicine_issuance_items').insert({issuance_id:issuance.id,medicine_id:medicine.id,medicine_name:medicine.generic_name,strength:medicine.strength,dosage_form:medicine.dosage_form,unit:medicine.unit,quantity,dosage:'Age-appropriate dose',frequency:'As instructed',duration:'Single clinic dose',instructions:'Observe response.',expiration_date_snapshot:medicine.expiration_date,batch_number_snapshot:medicine.batch_number});
    if (itemError) throw itemError;
    await client.from('medicines').update({quantity:Math.max(0,medicine.quantity-quantity)}).eq('id',medicine.id);
  }

  const actions=['LOGIN','CREATE_PATIENT','CREATE_VISIT','CREATE_CONSULTATION','ISSUE_MEDICINE','UPDATE_PATIENT','UPDATE_MEDICINE'];
  const actors=[admin,nurse,clinicStaff];
  const logRows=Array.from({length:30},(_,index)=>({user_id:actors[index%actors.length].id,action:actions[index%actions.length],description:`Fictional audited development activity ${index+1}.`,entity_type:index%3===0?'students':index%3===1?'visits':'consultations',metadata:{demo:true,sequence:index+1},created_at:new Date(now.getTime()-index*60*60*1000).toISOString()}));
  const { error: logError } = await client.from('activity_logs').insert(logRows);
  if (logError) throw logError;

  const notificationRows=[
    {target_user_id:nurse.id,type:'LOW_STOCK',title:'Low stock medicine',message:'Loratadine is below its minimum stock level.',severity:'warning',link:'/medicines',source_entity_type:'medicine',source_entity_id:medicines[3].id},
    {target_user_id:admin.id,type:'EXPIRED_MEDICINE',title:'Expired medicine detected',message:'Expired Test Stock is blocked from issuance.',severity:'critical',link:'/medicines',source_entity_type:'medicine',source_entity_id:medicines[15].id},
    {target_user_id:clinicStaff.id,type:'CLINIC_ALERT',title:'Development clinic notice',message:'This notification contains fictional information for testing.',severity:'info',link:'/dashboard'}
  ];
  await client.from('notifications').insert(notificationRows);

  console.log('\nDemo seed completed:');
  console.log(`  ${students.length} students`);
  console.log(`  ${visits.length} visits`);
  console.log(`  ${consultations.length} consultations`);
  console.log(`  ${medicines.length} medicines`);
  console.log('  12 medicine issuances and 30 explicit audit records');
  console.log('All names and medical details are fictional development data.');
}

main().catch(error=>fail('Demo-data seed failed.',error));
