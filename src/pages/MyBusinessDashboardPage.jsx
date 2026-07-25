import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import ProductCatalogManager from './ProductCatalogManager'

// Drop this in anywhere a logged-in business owner should land to manage
// their catalog. It finds their business itself via auth — no props needed.
export default function MyBusinessDashboardPage() {
  const [business, setBusiness] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadMyBusiness()
  }, [])

  async function loadMyBusiness() {
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Please log in to manage your business.')
      setLoading(false)
      return
    }

    const { data, error: fetchError } = await supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', user.id)
      .single()

    if (fetchError || !data) {
      setError("We couldn't find a business linked to your account. Make sure you're logged in as the business owner.")
      setLoading(false)
      return
    }

    setBusiness(data)
    setLoading(false)
  }

  if (loading) return <div className="p-6 text-gray-500">Loading your business...</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>

  return <ProductCatalogManager businessId={business.id} />
}
