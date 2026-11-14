import { createFileRoute, Link } from '@tanstack/react-router'
import { AppShell } from '../components/app-shell'

export const Route = createFileRoute('/')({ component: HomePage })

function HomePage() {
  return (
    <AppShell>
      <h1>나건렙</h1>
      <nav aria-label="건강 기록" className="home-links">
        <Link to="/body-weight">몸무게 기록</Link>
        <Link to="/body-weight-history">몸무게 기록 목록</Link>
        <Link to="/body-weight-goal">몸무게 목표</Link>
        <Link to="/body-weight-progression">몸무게 변화</Link>
        <Link to="/progression">성장 기록</Link>
        <Link to="/settings">기록 설정</Link>
        <Link to="/workouts">운동 기록</Link>
      </nav>
    </AppShell>
  )
}
