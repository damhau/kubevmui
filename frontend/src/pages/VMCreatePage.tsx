import { useNavigate } from 'react-router-dom'
import { VMCreateWizard } from '@/components/vm/VMCreateWizard'

export function VMCreatePage() {
  const navigate = useNavigate()

  return (
    <VMCreateWizard
      onClose={() => navigate('/vms')}
      onSuccess={() => navigate('/vms')}
    />
  )
}
