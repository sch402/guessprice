import dynamic from 'next/dynamic';
const App = dynamic(() => import('../../components/AppShell'), {
  ssr: false,
});

export async function generateStaticParams() {
  return [
    { all: ['auth', 'callback'] },
    { all: ['privacy'] },
    { all: ['terms'] },
    { all: ['discover'] },
    { all: ['guess'] },
    { all: ['leaderboard'] },
    { all: ['me', 'guesses'] },
    { all: ['me'] },
  ];
}

export default function Page() {
  return <App />;
}
