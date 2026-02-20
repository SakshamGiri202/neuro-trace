import type { AnalysisResult, TxRow } from './types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function uploadTransactions(file: File): Promise<any> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData,
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Upload failed')
    }

    const result = await response.json()

    // Fetch graph data from cytoscape endpoint
    try {
        const graphResponse = await fetch(`${API_BASE_URL}/api/graph/cytoscape`)
        if (graphResponse.ok) {
            const graphData = await graphResponse.json()
            result.graphData = graphData
        }
    } catch (e) {
        console.warn('Failed to fetch graph data:', e)
    }

    return result
}
