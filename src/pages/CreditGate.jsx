export async function chargeUserCredits(action, amount) {
  // Launch mode — payments disabled. Everything is free.
  return { success: true, insufficientCredits: false }
}

export async function chargeBusinessCredits(businessId, action, amount) {
  // Launch mode — payments disabled. Everything is free.
  return { success: true, insufficientCredits: false }
}