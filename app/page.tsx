import { redirect } from 'next/navigation';

export default function Home() {
  if (process.env.NEEDS_SETUP === 'true') {
    redirect('/setup');
  }
  redirect('/login');
}
