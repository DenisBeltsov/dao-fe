import './App.css'

function App() {

  const ALCHEMY_KEY = import.meta.env.VITE_ALCHEMY_KEY;

  return (
	<div className={"app-container"}>
	  {ALCHEMY_KEY} - ALCHEMY_KEY
	</div>
  )
}

export default App
