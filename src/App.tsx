/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { XMLConverter } from './components/xml-converter'
import { ErrorBoundary } from './components/error-boundary'

export default function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        <XMLConverter />
      </div>
    </ErrorBoundary>
  )
}
