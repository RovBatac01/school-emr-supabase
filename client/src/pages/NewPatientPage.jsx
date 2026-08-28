import { useNavigate } from 'react-router-dom';
import { Card } from '../components/UI';
import PatientForm from '../components/PatientForm';
export default function NewPatientPage(){const navigate=useNavigate();return <div className="space-y-5"><div><h2 className="page-title">Register patient</h2><p className="muted mt-1">Create a new student clinic record. Student ID must be unique.</p></div><Card className="p-5"><PatientForm onCancel={()=>navigate('/patients')} onSaved={id=>navigate(`/patients/${id}`)}/></Card></div>;}
