import "./App.css";
import Header from "./components/Header";
import Features from "./components/Features";
import Testimonials from "./components/Testimonials";
import CallToAction from "./components/CallToAction";

function App() {
  return (
    <div className="App">
      <Header />
      <Features />
      <Testimonials />
      <CallToAction />
    </div>
  );
}

export default App;
