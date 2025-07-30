// import ClientCacheProvider from './component/ClientCacheProvider';
import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'CSMC Chatbot',
  description: 'Chhatrapati Sambhajinagar Municipal Corporation Chatbot',
  icons: {
    icon: '/csmc-logo.png',
    shortcut: '/csmc-logo.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/csmc-logo.png" sizes="any" />
      </head>
      <body className={inter.className}>
        {/* Wrap the children with the client-side component */}
        {/* <ClientCacheProvider> */}
          {children}
        {/* </ClientCacheProvider> */}
      </body>
    </html>
  );
}
