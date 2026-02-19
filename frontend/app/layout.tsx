import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'RIFT Forensics Engine',
  description: 'Financial crime detection and forensic analysis tool with Algorand blockchain anchoring',
  generator: 'v0.app',

}

export const viewport: Viewport = {
  themeColor: '#0A0A0F',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${ibmPlexMono.variable} font-sans antialiased bg-diagonal-lines`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
