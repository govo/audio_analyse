import { Layout, Typography } from 'antd'
import AudioAnalyzer from './components/AudioAnalyzer'
import './App.css'

const { Header, Content } = Layout
const { Title } = Typography

function App() {
  return (
    <Layout className="layout" style={{ width: '100%' }}>
      <Header style={{ background: '#fff' }}>
        <Title level={3} style={{ margin: '16px 0' }}>音频频响曲线分析工具</Title>
      </Header>
      <Content>
        <AudioAnalyzer />
      </Content>
    </Layout>
  )
}

export default App
