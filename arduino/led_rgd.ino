#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN 10
#define RST_PIN 9
MFRC522 mfrc522(SS_PIN, RST_PIN);

// RGB LED Pins
int r_led = 3;
int g_led = 5;
int b_led = 6;

// Using a different pin for the buzzer to avoid conflict with RST_PIN
const int buzzerPin = 8;

void setup() {
  Serial.begin(9600);
  SPI.begin();
  mfrc522.PCD_Init();
  
  pinMode(r_led, OUTPUT);
  pinMode(g_led, OUTPUT);
  pinMode(b_led, OUTPUT);
  pinMode(buzzerPin, OUTPUT);

  // Force immediate LED off - use digitalWrite for more immediate response
  digitalWrite(r_led, LOW);
  digitalWrite(g_led, LOW);
  digitalWrite(b_led, LOW);

}

void loop() {
  // Wait for a new card
  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) {
    return;

  }

  for (byte i = 0; i < mfrc522.uid.size; i++) {
    Serial.print(mfrc522.uid.uidByte[i] < 0x10 ? " 0" : " ");
    Serial.print(mfrc522.uid.uidByte[i], HEX);
  }
  Serial.println();

  // Beep twice with LED flashing in sync
  for (int i = 0; i < 2; i++) {
    // Turn LED on - use digitalWrite for digital pins or maximum analogWrite for quick response
    digitalWrite(r_led, HIGH);  // For common cathode RGB LED
    digitalWrite(g_led, LOW);
    digitalWrite(b_led, LOW);
    
    // Turn on buzzer
    tone(buzzerPin, 4000);
    delay(200);
    
    // Force immediate LED off
    digitalWrite(r_led, LOW);
    digitalWrite(g_led, LOW);
    digitalWrite(b_led, LOW);
    
    // Turn off buzzer
    noTone(buzzerPin);
    
    // Add a small delay between beeps
    delay(100);
  }

  // Halt the card to be ready for the next scan
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
  
  // Add a small delay before looking for another card
  delay(3000);
}

// Modified LED function to force quicker response
void ledColor(int rValue, int gValue, int bValue) {
  // If the value is 0, use digitalWrite for immediate response
  // Otherwise use analogWrite for color mixing
  
  if (rValue == 0) digitalWrite(r_led, LOW);
  else analogWrite(r_led, rValue);
  
  if (gValue == 0) digitalWrite(g_led, LOW);
  else analogWrite(g_led, gValue);
  
  if (bValue == 0) digitalWrite(b_led, LOW);
  else analogWrite(b_led, bValue);
}