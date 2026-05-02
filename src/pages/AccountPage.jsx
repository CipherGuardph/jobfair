import { useEffect, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { db } from '../services/firebase';

export function AccountPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({ displayName: '', companyName: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    setForm({
      displayName: profile?.displayName || '',
      companyName: profile?.companyName || ''
    });
  }, [profile]);

  const handleSave = async (event) => {
    event.preventDefault();
    await updateDoc(doc(db, 'users', user.uid), {
      displayName: form.displayName,
      companyName: form.companyName,
      updatedAt: serverTimestamp()
    });
    await refreshProfile();
    setMessage('Profile updated.');
  };

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div>
        <h1 className="page-title">Account</h1>
        <p className="muted">Update your recruiter profile details.</p>
      </div>
      {message ? <div className="message message-success">{message}</div> : null}
      <form className="card card-dark card-pad stack" onSubmit={handleSave}>
        <label className="field">
          <span>Display name</span>
          <input className="input" value={form.displayName} onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))} />
        </label>
        <label className="field">
          <span>Company name</span>
          <input className="input" value={form.companyName} onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))} />
        </label>
        <div className="muted-box">
          <strong>Email</strong>
          <div className="muted">{user?.email}</div>
          <div className="divider" />
          <strong>Role</strong>
          <div className="muted">{profile?.role}</div>
        </div>
        <button className="btn btn-primary" type="submit">Save changes</button>
      </form>
    </div>
  );
}

