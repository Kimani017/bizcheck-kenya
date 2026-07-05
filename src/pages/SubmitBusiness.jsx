import { useState } from 'react'
import BusinessApplicationForm from './BusinessApplicationForm'

export default function SubmitBusiness({ currentUser, onDone }) {
  return (
    <div className="section" style={{ display: 'flex', justifyContent: 'center' }}>
      <BusinessApplicationForm
        currentUser={currentUser}
        onDone={() => { alert('✓ Application submitted! Our team will review your documents and verify your business within 24-48hrs.'); onDone() }}
        onCancel={onDone}
      />
    </div>
  )
}
