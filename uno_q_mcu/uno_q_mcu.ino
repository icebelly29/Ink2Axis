/*
 * uno_q_mcu.ino - STM32U585 MCU G-code Motion Controller for Arduino UNO Q
 * Parses standard G0/G1 commands sent from Linux MPU via internal serial IPC.
 * Controls X/Y stepper motor drivers and Z-axis toolhead actuator.
 */

#include <Arduino.h>

// Hardware Pin Definitions for CNC Toolhead and Stepper Motor Drivers
#define STEP_PIN_X  2
#define DIR_PIN_X   3

#define STEP_PIN_Y  4
#define DIR_PIN_Y   5

#define TOOL_Z_PIN  6  // PWM / Servo pin for Z tool depth control

// Target Position State
float currentX = 0.0;
float currentY = 0.0;
float currentZ = 0.0;
float currentF = 500.0;

void setup() {
  // Initialize internal serial communication with Linux MPU
  Serial.begin(115200);
  while (!Serial) {
    ; // Wait for serial connection
  }

  pinMode(STEP_PIN_X, OUTPUT);
  pinMode(DIR_PIN_X, OUTPUT);
  pinMode(STEP_PIN_Y, OUTPUT);
  pinMode(DIR_PIN_Y, OUTPUT);
  pinMode(TOOL_Z_PIN, OUTPUT);

  // Send startup banner to Linux MPU
  Serial.println("Ink2Axis G-code Controller Ready (STM32U585 MCU)");
  Serial.println("ok");
}

void setToolZ(float z) {
  currentZ = z;
  // Map Z depth to PWM tool actuator position:
  // Z > 0 => Tool Up (Safe height)
  // Z = -0.2 => Crease
  // Z = -0.5 => Score
  // Z = -2.0 => Thru Cut
  int pwmVal = 0;
  if (z >= 0.0) {
    pwmVal = 0;   // Retract
  } else if (z >= -0.3) {
    pwmVal = 80;  // Crease PWM
  } else if (z >= -1.0) {
    pwmVal = 160; // Score PWM
  } else {
    pwmVal = 255; // Thru Cut PWM
  }
  analogWrite(TOOL_Z_PIN, pwmVal);
}

void moveLinear(float targetX, float targetY, float feedRate, bool isRapid) {
  // Compute distance delta
  float deltaX = targetX - currentX;
  float deltaY = targetY - currentY;
  
  // Set Direction Pins
  digitalWrite(DIR_PIN_X, deltaX >= 0 ? HIGH : LOW);
  digitalWrite(DIR_PIN_Y, deltaY >= 0 ? HIGH : LOW);

  long stepsX = abs(deltaX) * 80; // 80 steps per mm (standard 1/8 microstepping)
  long stepsY = abs(deltaY) * 80;
  long maxSteps = max(stepsX, stepsY);

  if (maxSteps == 0) return;

  // Compute step delay from feed rate (mm/min)
  long stepDelayMicros = (60000000L / (feedRate * 80));
  if (isRapid) stepDelayMicros = stepDelayMicros / 2; // Faster for G0 rapid

  for (long i = 0; i < maxSteps; i++) {
    if (i < stepsX) {
      digitalWrite(STEP_PIN_X, HIGH);
    }
    if (i < stepsY) {
      digitalWrite(STEP_PIN_Y, HIGH);
    }
    delayMicroseconds(5);
    digitalWrite(STEP_PIN_X, LOW);
    digitalWrite(STEP_PIN_Y, LOW);
    delayMicroseconds(stepDelayMicros);
  }

  currentX = targetX;
  currentY = targetY;
}

void parseAndExecuteGCode(String line) {
  line.trim();
  if (line.length() == 0 || line.startsWith(";")) {
    return; // Ignore empty lines and comments
  }

  // Convert line to uppercase for consistent parsing
  line.toUpperCase();

  bool isG0 = line.startsWith("G0");
  bool isG1 = line.startsWith("G1");

  if (isG0 || isG1) {
    float newX = currentX;
    float newY = currentY;
    float newZ = currentZ;
    float newF = currentF;

    int posX = line.indexOf('X');
    if (posX != -1) newX = line.substring(posX + 1).toFloat();

    int posY = line.indexOf('Y');
    if (posY != -1) newY = line.substring(posY + 1).toFloat();

    int posZ = line.indexOf('Z');
    if (posZ != -1) {
      newZ = line.substring(posZ + 1).toFloat();
      setToolZ(newZ);
    }

    int posF = line.indexOf('F');
    if (posF != -1) newF = line.substring(posF + 1).toFloat();

    currentF = newF;
    moveLinear(newX, newY, currentF, isG0);

    Serial.println("ok");
  } else if (line.startsWith("G21") || line.startsWith("G90") || line.startsWith("G17")) {
    Serial.println("ok");
  } else if (line.startsWith("M30")) {
    setToolZ(5.0);
    Serial.println("ok");
  } else {
    Serial.println("ok"); // Standard GRBL ok response
  }
}

void loop() {
  if (Serial.available() > 0) {
    String line = Serial.readStringUntil('\n');
    parseAndExecuteGCode(line);
  }
}
