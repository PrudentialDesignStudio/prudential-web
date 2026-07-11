import { motion } from "framer-motion";
import { Baby, GraduationCap, School, Rocket } from "lucide-react";

const STAGES = [
  {
    title: "Early Years",
    age: "Ages 2 - 5",
    desc: "A nurturing environment where curiosity meets play. We focus on foundational literacy, numeracy, and social confidence.",
    icon: <Baby size={32} />,
    color: "#00aeef",
    points: ["Play-based Learning", "Phonics Foundation", "Motor Skills Development"]
  },
  {
    title: "Primary School",
    age: "Ages 5 - 11",
    desc: "Combining the British National Curriculum with Nigerian cultural studies to build strong academic and moral foundations.",
    icon: <School size={32} />,
    color: "#d4af37",
    points: ["Cambridge Standards", "Nigerian Cultural Studies", "Critical Thinking"]
  },
  {
    title: "Secondary School",
    age: "Ages 11 - 16+",
    desc: "Preparing students for global success through rigorous academics, leadership training, and career guidance.",
    icon: <GraduationCap size={32} />,
    color: "#0B1F5C",
    points: ["IGCSE Preparation", "WAEC Excellence", "Leadership Programs"]
  },
  {
    title: "Global Future",
    age: "Beyond PIS",
    desc: "Our graduates transition to top universities in Nigeria, the UK, and the US as confident global citizens.",
    icon: <Rocket size={32} />,
    color: "#e11d48",
    points: ["University Placement", "Alumni Network", "Life-long Success"]
  }
];

export default function StudentJourney() {
  return (
    <section className="journey-section">
      <div className="pis-container">
        <div className="journey-header">
          <span className="pis-eyebrow">The PIS Experience</span>
          <h2 className="section-title">The Student Journey</h2>
          <p className="section-desc">From first steps to global success, see how we prepare your child for every stage of life.</p>
        </div>

        <div className="journey-grid">
          {STAGES.map((stage, idx) => (
            <motion.div 
              key={stage.title}
              className="journey-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.15 }}
            >
              <div className="journey-connector" style={{ background: stage.color }} />
              <div className="journey-icon-wrap" style={{ color: stage.color, background: `${stage.color}10` }}>
                {stage.icon}
                <span className="journey-step-num">{idx + 1}</span>
              </div>
              <div className="journey-content">
                <span className="journey-age" style={{ color: stage.color }}>{stage.age}</span>
                <h3 className="journey-title">{stage.title}</h3>
                <p className="journey-desc">{stage.desc}</p>
                <ul className="journey-points">
                  {stage.points.map(p => (
                    <li key={p}>
                      <span className="point-dot" style={{ background: stage.color }} />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
