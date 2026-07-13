import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Globe } from 'lucide-react';
import './NavTabs.css';

// finbro-style segmented control for page navigation
export const NavTabs = () => (
    <nav className="nav-tabs" aria-label="Primary">
        <NavLink to="/" end className={({ isActive }) => `nav-tab ${isActive ? 'is-active' : ''}`}>
            <LayoutDashboard size={14} aria-hidden="true" /> Dashboard
        </NavLink>
        <NavLink to="/map" className={({ isActive }) => `nav-tab ${isActive ? 'is-active' : ''}`}>
            <Globe size={14} aria-hidden="true" /> World Map
        </NavLink>
    </nav>
);
