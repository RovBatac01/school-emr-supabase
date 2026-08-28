import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/UI';
import VisitForm from '../components/VisitForm';
export default function NewVisitPage(){const navigate=useNavigate();const [search]=useSearchParams();return <div className="space-y-5"><div><h2 className="page-title">Register clinic visit</h2><p className="muted mt-1">Document the student's arrival, complaint, priority, and visit context.</p></div><Card className="p-5"><VisitForm initialStudentId={search.get('student')} onCancel={()=>navigate('/visits')} onSaved={data=>navigate(`/visits/${data.id}`)}/></Card></div>;}
