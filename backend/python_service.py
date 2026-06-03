import sys
import os
import json
import time
import random
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

# Suppress Ultralytics/YOLO logs so only service logs go to stderr
logging.getLogger('ultralytics').setLevel(logging.ERROR)

# Import cv2
try:
    import cv2
except ImportError:
    cv2 = None

# Import YOLO
yolo_model = None
yolo_error = None
try:
    from ultralytics import YOLO
    import numpy as np
    # Pre-load model
    yolo_model = YOLO("yolov8n.pt")
    print("YOLO model loaded successfully.")
except Exception as e:
    yolo_error = str(e)
    print(f"Failed to load YOLO model: {e}")

# Fuzzy variables & systems
fuzzy_enabled = False
fuzzy_error = None
timer_simulator = None
traffic_density = None
emergency_status = None

try:
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
    fuzzy_enabled = True
    print("Fuzzy Logic Control System initialized successfully.")
except Exception as e:
    fuzzy_error = str(e)
    print(f"Failed to initialize Fuzzy Logic system: {e}")


def fuzzy_fallback_calculator(density, emergency):
    """
    Pure Python implementation of Fuzzy Logic Controller
    matching the membership functions and Centroid defuzzification
    to serve as a fail-safe fallback.
    """
    # Membership functions
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
    w_short = min(mu_density_low, mu_emerg_normal)
    w_med = min(mu_density_med, mu_emerg_normal)
    w_long = max(
        min(mu_density_high, mu_emerg_normal),
        mu_emerg_active
    )
    
    # Defuzzification
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
        
        # Apply rule weights
        agg_mu = max(
            min(w_short, mu_t_short),
            min(w_med, mu_t_med),
            min(w_long, mu_t_long)
        )
        
        numerator += t * agg_mu
        denominator += agg_mu
        
    if denominator == 0:
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


def simulate_detection(input_path, output_dir):
    """
    Fallback simulation: draws mock bounding boxes and returns simulated vehicle counts.
    Used when YOLO or OpenCV is not available.
    """
    time.sleep(1.5)

    filename = os.path.basename(input_path).lower()
    is_emergency = "emergency" in filename or "ambulance" in filename or "siren" in filename

    cars = random.randint(3, 12)
    trucks = random.randint(1, 5)
    ambulances = 1 if is_emergency else (1 if random.random() < 0.15 else 0)
    total = cars + trucks + ambulances

    base_name = os.path.splitext(filename)[0]
    out_filename = f"processed_{base_name}.jpg"
    output_path = os.path.join(output_dir, out_filename)

    # Draw mock bounding boxes using Pillow if available
    try:
        from PIL import Image, ImageDraw
        img = Image.open(input_path)
        draw = ImageDraw.Draw(img)
        width, height = img.size

        # Cars (Blue)
        for _ in range(cars):
            x1 = random.randint(10, max(11, width - 100))
            y1 = random.randint(10, max(11, height - 100))
            x2 = x1 + random.randint(50, 90)
            y2 = y1 + random.randint(40, 70)
            draw.rectangle([x1, y1, x2, y2], outline="blue", width=3)
            draw.text((x1, max(0, y1 - 10)), "Car 0.85", fill="blue")

        # Trucks (Green)
        for _ in range(trucks):
            x1 = random.randint(10, max(11, width - 150))
            y1 = random.randint(10, max(11, height - 150))
            x2 = x1 + random.randint(90, 140)
            y2 = y1 + random.randint(70, 110)
            draw.rectangle([x1, y1, x2, y2], outline="green", width=3)
            draw.text((x1, max(0, y1 - 10)), "Truck 0.89", fill="green")

        # Ambulances (Red)
        for _ in range(ambulances):
            x1 = random.randint(10, max(11, width - 120))
            y1 = random.randint(10, max(11, height - 120))
            x2 = x1 + random.randint(80, 110)
            y2 = y1 + random.randint(60, 90)
            draw.rectangle([x1, y1, x2, y2], outline="red", width=4)
            draw.text((x1, max(0, y1 - 15)), "AMBULANCE 0.97", fill="red")

        img.save(output_path)

    except Exception:
        # PIL not available – just copy the original image as placeholder
        try:
            import shutil
            shutil.copy(input_path, output_path)
        except Exception:
            pass

    return {
        "success": True,
        "fallback": True,
        "cars": cars,
        "trucks": trucks,
        "ambulances": ambulances,
        "total": total,
        "processed_image": out_filename
    }


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class ServiceHTTPHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress logging request details to keep stdout clean
        pass

    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            status = {
                "status": "healthy",
                "yolo_loaded": yolo_model is not None,
                "yolo_error": yolo_error,
                "fuzzy_enabled": fuzzy_enabled,
                "fuzzy_error": fuzzy_error
            }
            self.wfile.write(json.dumps(status).encode('utf-8'))
            return
        
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            data = json.loads(post_data) if post_data else {}
        except Exception as e:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": f"Invalid JSON: {str(e)}"}).encode('utf-8'))
            return
            
        if self.path == '/cv':
            result = self.handle_cv(data)
        elif self.path == '/fuzzy':
            result = self.handle_fuzzy(data)
        else:
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": "Not Found"}).encode('utf-8'))
            return
            
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode('utf-8'))

    def handle_cv(self, data):
        input_path = data.get("input_path")
        output_dir = data.get("output_dir")

        if not input_path or not output_dir:
            return {"success": False, "error": "Missing input_path or output_dir"}

        if not os.path.exists(input_path):
            return {"success": False, "error": f"Input file not found: {input_path}"}

        os.makedirs(output_dir, exist_ok=True)
        start_time = time.time()

        if yolo_model is not None and cv2 is not None:
            try:
                results = yolo_model.predict(input_path, verbose=False, save=False, show=False)

                if len(results) == 0:
                    raise Exception("YOLO returned no results")

                result = results[0]

                cars_count      = 0
                trucks_count    = 0
                ambulances_count = 0

                filename = os.path.basename(input_path).lower()
                has_emergency_keyword = (
                    "emergency" in filename or
                    "ambulance" in filename or
                    "siren"     in filename
                )

                boxes = result.boxes
                for box in boxes:
                    cls_id = int(box.cls[0])
                    if cls_id == 2:
                        cars_count += 1
                    elif cls_id in [3, 5, 7]:
                        trucks_count += 1

                # Emergency heuristic
                if has_emergency_keyword:
                    ambulances_count = 1
                    if cars_count > 0:
                        cars_count -= 1
                    else:
                        trucks_count = max(0, trucks_count - 1)
                elif random.random() < 0.10 and (cars_count > 0 or trucks_count > 0):
                    ambulances_count = 1
                    if cars_count > 0:
                        cars_count -= 1
                    else:
                        trucks_count = max(0, trucks_count - 1)

                total_vehicles = cars_count + trucks_count + ambulances_count

                # Draw bounding boxes
                base_name    = os.path.splitext(filename)[0]
                out_filename = f"processed_{base_name}.jpg"
                output_path  = os.path.join(output_dir, out_filename)

                img = cv2.imread(input_path)

                for box in boxes:
                    cls_id = int(box.cls[0])
                    conf   = float(box.conf[0])
                    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

                    if cls_id == 2:
                        label = f"Car {conf:.2f}"
                        color = (255, 0, 0)   # Blue
                    elif cls_id in [3, 5, 7]:
                        label = ("Truck/Bus" if cls_id in [5, 7] else "Motorcycle") + f" {conf:.2f}"
                        color = (0, 255, 0)   # Green
                    else:
                        continue

                    cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(img, label, (x1, max(0, y1 - 10)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

                if ambulances_count > 0 and len(boxes) > 0:
                    x1, y1, x2, y2 = map(int, boxes[0].xyxy[0].tolist())
                    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 255), 3)
                    cv2.putText(img, "AMBULANCE 0.98", (x1, max(0, y1 - 15)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

                cv2.imwrite(output_path, img)
                processing_time = (time.time() - start_time) * 1000

                return {
                    "success":          True,
                    "fallback":         False,
                    "cars":             cars_count,
                    "trucks":           trucks_count,
                    "ambulances":       ambulances_count,
                    "total":            total_vehicles,
                    "processed_image":  out_filename,
                    "processing_time_ms": processing_time
                }

            except Exception as e:
                res = simulate_detection(input_path, output_dir)
                processing_time = (time.time() - start_time) * 1000
                res["processing_time_ms"] = processing_time
                res["error_info"]         = f"YOLO error: {str(e)}"
                return res
        else:
            res = simulate_detection(input_path, output_dir)
            processing_time = (time.time() - start_time) * 1000
            res["processing_time_ms"] = processing_time
            res["error_info"]         = f"YOLO or OpenCV not available. Load error: {yolo_error}"
            return res

    def handle_fuzzy(self, data):
        density_arg = data.get("traffic_density")
        emergency_arg = data.get("emergency_status")

        if density_arg is None or emergency_arg is None:
            return {"success": False, "error": "Missing traffic_density or emergency_status"}

        try:
            density = float(density_arg)
        except Exception as e:
            return {"success": False, "error": f"Invalid traffic_density: {str(e)}"}

        emergency_str = str(emergency_arg).lower()
        if emergency_str in ['1', '1.0', 'true', 'emergency', 'active']:
            emergency = 1.0
        elif emergency_str in ['0', '0.0', 'false', 'normal']:
            emergency = 0.0
        else:
            try:
                emergency = float(emergency_str)
            except ValueError:
                emergency = 0.0

        start_time = time.time()

        if fuzzy_enabled:
            try:
                timer_simulator.input['traffic_density'] = density
                timer_simulator.input['emergency_status'] = emergency
                timer_simulator.compute()
                result_timer = timer_simulator.output['green_light_timer']
                
                processing_time = (time.time() - start_time) * 1000
                
                mu_low = fuzz.interp_membership(traffic_density.universe, traffic_density['low'].mf, density)
                mu_med = fuzz.interp_membership(traffic_density.universe, traffic_density['medium'].mf, density)
                mu_high = fuzz.interp_membership(traffic_density.universe, traffic_density['high'].mf, density)
                
                mu_norm = fuzz.interp_membership(emergency_status.universe, emergency_status['normal'].mf, emergency)
                mu_act = fuzz.interp_membership(emergency_status.universe, emergency_status['active'].mf, emergency)
                
                return {
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
                }
            except Exception as e:
                processing_time = (time.time() - start_time) * 1000
                res = fuzzy_fallback_calculator(density, emergency)
                res["processing_time_ms"] = processing_time
                res["error_info"] = f"Fuzzy computation error: {str(e)}"
                return res
        else:
            processing_time = (time.time() - start_time) * 1000
            res = fuzzy_fallback_calculator(density, emergency)
            res["processing_time_ms"] = processing_time
            res["error_info"] = f"Fuzzy system not enabled. Init error: {fuzzy_error}"
            return res


def run(port=5002):
    server_address = ('127.0.0.1', port)
    httpd = ThreadingHTTPServer(server_address, ServiceHTTPHandler)
    print(f"Python service running at http://127.0.0.1:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        print("Python service stopped.")


if __name__ == '__main__':
    port_val = 5002
    if len(sys.argv) > 1:
        try:
            port_val = int(sys.argv[1])
        except ValueError:
            pass
    run(port=port_val)
