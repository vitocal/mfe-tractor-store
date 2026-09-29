import register from "preact-custom-element";

import Navigation from "./navigation";

import "./header.css";

export interface Props { };

/**
 * Header component.
 */
const Header = () => {
  return (
    <header className="e_Header" data-boundary="explore">
      <div className="e_Header__cutter">
        <div className="e_Header__inner">
          <a className="e_Header__link" href="#/">
            <img className="e_Header__logo" src="/cdn/img/logo.svg" alt="Micro Frontends - Tractor Store" />
          </a>
          <div className="e_Header__navigation">
            <Navigation />
          </div>
          <div className="e_Header__cart">
            <checkout-c-minicart></checkout-c-minicart>
          </div>
        </div>
      </div>
    </header>
  );
};

export default register(Header, 'explore-components-header');