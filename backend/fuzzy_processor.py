import sys
import json
import time

def fuzzy_fallback_calculator(density, emergency):
    """
    Pure Python implementation of Fuzzy Logic Controller
    matching the membership functions and Centroid defuzzification
    to serve as a fail-safe fallback.
    """
    # Membership functions
    # Density: Low [0, 0, 40], Medium [20, 50, 80], High [60, 100, 100]
    mu_density_low = max(0.0, min((40.0 - density) / 40.0, 1.0)) if density <= 40.0 else 0.0
    
    if density >= 20.0 and density <= 50.0:
        mu_density_med = (density - 20.0) / 30.0
    elif density > 50.0 and density <= 80.0:
        mu_density_med = (80.0 - density) / 30.0
    else:
        mu_density_med = 0.0
        
    mu_density_high = max(0.0, min((density - 60.0) / 40.0, 1.0)) if density >= 60.0 else 0.0

    # Emergency: Normal [0, 0, 0.6], Emergency [0.4, 1, 1]
    mu_emerg_normal = max(0.0, min((0.6 - emergency) / 0.6, 1.0)) if emergency <= 0.6 else 0.0
    mu_emerg_active = max(0.0, min((emergency - 0.4) / 0.6, 1.0)) if emergency >= 0.4 else 0.0

    # Rules
    # Rule 1: If Density Low and Emergency Normal -> Timer Short
    # Rule 2: If Density Med and Emergency Normal -> Timer Med
    # Rule 3: If Density High and Emergency Normal -> Timer Long
    # Rule 4: If Emergency Active -> Timer Long (priority override)
    
    w_short = min(mu_density_low, mu_emerg_normal)
    w_med = min(mu_density_med, mu_emerg_normal)
    w_long = max(
        min(mu_density_high, mu_emerg_normal),
        mu_emerg_active
    )
    
    # Membership functions for output: Timer
    # Short [10, 10, 35] -> center around 15s
    # Medium [25, 50, 75] -> center around 50s
    # Long [65, 90, 90] -> center around 80s
    # Let's run a discrete centroid defuzzification
    timer_values = list(range(10, 91, 2))
    numerator = 0.0
    denominator = 0.0
    
    for t in timer_values:
        # Membership in Short
        mu_t_short = max(0.0, min((35.0 - t) / 25.0, 1.0)) if t <= 35.0 else 0.0
        # Membership in Medium
        if t >= 25.0 and t <= 50.0:
            mu_t_med = (t - 25.0) / 25.0
        elif t > 50.0 and t <= 75.0:
            mu_t_med = (75.0 - t) / 25.0
        else:
            mu_t_med = 0.0
        # Membership in Long
        mu_t_long = max(0.0, min((t - 65.0) / 25.0, 1.0)) if t >= 65.0 else 0.0
        
        # Apply rule weights (Mamdani implication)
        agg_mu = max(
            min(w_short, mu_t_short),
            min(w_med, mu_t_med),
            min(w_long, mu_t_long)
        )
        
        numerator += t * agg_mu
        denominator += agg_mu
        
    if denominator == 0:
        # Default value if no rules fire
        timer = 30.0
    else:
        timer = numerator / denominator
        
    return {
        "success": True,
        "fallback": True,
        "traffic_density": density,
        "emergency_status": "emergency" if emergency > 0.5 else "normal",
        "calculated_timer": round(timer, 2),
        "memberships": {
            "density": {"low": round(mu_density_low, 2), "medium": round(mu_density_med, 2), "high": round(mu_density_high, 2)},
            "emergency": {"normal": round(mu_emerg_normal, 2), "active": round(mu_emerg_active, 2)},
            "rules": {"short": round(w_short, 2), "medium": round(w_med, 2), "long": round(w_long, 2)}
        }
    }

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Missing arguments. Usage: fuzzy_processor.py <traffic_density> <emergency_status>"}))
        return

    try:
        density = float(sys.argv[1])
        emergency_arg = sys.argv[2].lower()
        
        # Parse emergency status
        if emergency_arg in ['1', '1.0', 'true', 'emergency', 'active']:
            emergency = 1.0
        elif emergency_arg in ['0', '0.0', 'false', 'normal']:
            emergency = 0.0
        else:
            try:
                emergency = float(emergency_arg)
            except ValueError:
                emergency = 0.0
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Invalid inputs: {str(e)}"}))
        return
        
    start_time = time.time()
    
    try:
        # Try importing scikit-fuzzy
        import numpy as np
        import skfuzzy as fuzz
        from skfuzzy import control as ctrl
        
        # Define Antecedents and Consequent
        traffic_density = ctrl.Antecedent(np.arange(0, 101, 1), 'traffic_density')
        emergency_status = ctrl.Antecedent(np.arange(0, 1.1, 0.1), 'emergency_status')
        green_light_timer = ctrl.Consequent(np.arange(10, 91, 1), 'green_light_timer')
        
        # Membership functions
        traffic_density['low'] = fuzz.trimf(traffic_density.universe, [0, 0, 40])
        traffic_density['medium'] = fuzz.trimf(traffic_density.universe, [20, 50, 80])
        traffic_density['high'] = fuzz.trimf(traffic_density.universe, [60, 100, 100])
        
        emergency_status['normal'] = fuzz.trimf(emergency_status.universe, [0, 0, 0.6])
        emergency_status['active'] = fuzz.trimf(emergency_status.universe, [0.4, 1.0, 1.0])
        
        green_light_timer['short'] = fuzz.trimf(green_light_timer.universe, [10, 10, 35])
        green_light_timer['medium'] = fuzz.trimf(green_light_timer.universe, [25, 50, 75])
        green_light_timer['long'] = fuzz.trimf(green_light_timer.universe, [65, 90, 90])
        
        # Rules
        rule1 = ctrl.Rule(traffic_density['low'] & emergency_status['normal'], green_light_timer['short'])
        rule2 = ctrl.Rule(traffic_density['medium'] & emergency_status['normal'], green_light_timer['medium'])
        rule3 = ctrl.Rule(traffic_density['high'] & emergency_status['normal'], green_light_timer['long'])
        rule4 = ctrl.Rule(emergency_status['active'], green_light_timer['long'])
        
        # Control system
        timer_ctrl = ctrl.ControlSystem([rule1, rule2, rule3, rule4])
        timer_simulator = ctrl.ControlSystemSimulation(timer_ctrl)
        
        # Set inputs
        timer_simulator.input['traffic_density'] = density
        timer_simulator.input['emergency_status'] = emergency
        
        # Compute
        timer_simulator.compute()
        result_timer = timer_simulator.output['green_light_timer']
        
        processing_time = (time.time() - start_time) * 1000
        
        # Get fuzzy memberships for debug inspection
        mu_low = fuzz.interp_membership(traffic_density.universe, traffic_density['low'].mf, density)
        mu_med = fuzz.interp_membership(traffic_density.universe, traffic_density['medium'].mf, density)
        mu_high = fuzz.interp_membership(traffic_density.universe, traffic_density['high'].mf, density)
        
        mu_norm = fuzz.interp_membership(emergency_status.universe, emergency_status['normal'].mf, emergency)
        mu_act = fuzz.interp_membership(emergency_status.universe, emergency_status['active'].mf, emergency)
        
        print(json.dumps({
            "success": True,
            "fallback": False,
            "traffic_density": density,
            "emergency_status": "emergency" if emergency > 0.5 else "normal",
            "calculated_timer": round(result_timer, 2),
            "processing_time_ms": processing_time,
            "memberships": {
                "density": {"low": round(float(mu_low), 2), "medium": round(float(mu_med), 2), "high": round(float(mu_high), 2)},
                "emergency": {"normal": round(float(mu_norm), 2), "active": round(float(mu_act), 2)}
            }
        }))
        
    except Exception as e:
        # Fallback to analytical calculation
        processing_time = (time.time() - start_time) * 1000
        res = fuzzy_fallback_calculator(density, emergency)
        res["processing_time_ms"] = processing_time
        res["error_info"] = str(e)
        print(json.dumps(res))

if __name__ == "__main__":
    main()
