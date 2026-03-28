import { useNavigate, useSearchParams } from 'react-router-dom'
import { VMCreateWizard } from '@/components/vm/VMCreateWizard'

export function VMCreatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const templateName = searchParams.get('template') || undefined

  return (
    <VMCreateWizard
      onClose={() => navigate('/vms')}
      onSuccess={() => navigate('/vms')}
      initialTemplate={templateName}
    />
  )
}
